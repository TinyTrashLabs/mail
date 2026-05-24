import { Router } from 'express';
import { pool } from '../db.js';
import { canAccessMailbox, canReadMessage, parseMessageId } from '../access.js';
import { verifyViewerToken } from '../viewer-token.js';

const router = Router();

function checkAuth(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.VIEWER_SECRET}`) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

function resolveViewerUser(req, res) {
  const header = req.headers['x-viewer-user'];
  if (header === undefined) return '';
  if (typeof header !== 'string' || header === '') return '';
  const user = verifyViewerToken(header);
  if (user === null) {
    res.status(401).json({ error: 'invalid viewer token' });
    return null;
  }
  return user;
}

/**
 * Build SQL fragments for per-user trash filtering.
 *
 * - viewerUser: the authenticated viewer username (or '' for anonymous)
 * - trashOnly: true to show ONLY trashed messages, false to EXCLUDE trashed
 * - params: the array of bound params we'll push the username into (mutated)
 *
 * Returns { join, where } fragments to splice into the query.
 * Anonymous viewers get empty fragments — they see all messages regardless
 * of any user's trash state.
 */
export function buildTrashFilter(mailbox, viewerUser, trashOnly, params) {
  if (mailbox === "shared") {
    // Shared mailbox: filter on the global flag (set when any user trashes from shared).
    const where = trashOnly
      ? `AND m.is_globally_trashed = TRUE`
      : `AND m.is_globally_trashed = FALSE`;
    return { join: "", where };
  }
  // Personal mailbox: per-user trash state via message_state join.
  if (!viewerUser) return { join: "", where: "" };
  params.push(viewerUser);
  const userParam = `$${params.length}`;
  const join = `LEFT JOIN message_state ms ON ms.message_id = m.id AND ms.username = ${userParam}`;
  const where = trashOnly
    ? `AND COALESCE(ms.is_trashed, FALSE) = TRUE`
    : `AND COALESCE(ms.is_trashed, FALSE) = FALSE`;
  return { join, where };
}

router.get('/messages', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;

  const requestedMailbox = req.query.mailbox || 'shared';
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;
  const tag = req.query.tag || null; // optional tag filter
  // Trash filter: ?trash=1 shows only trashed; default excludes trashed.
  const trashOnly = req.query.trash === '1' || req.query.trash === 'true';

  if (!canAccessMailbox(requestedMailbox, viewerUser)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    const params = [requestedMailbox, limit, offset];
    if (tag) params.push(tag);
    const trash = buildTrashFilter(requestedMailbox, viewerUser, trashOnly, params);

    const tagExists = tag
      ? `AND EXISTS (SELECT 1 FROM message_tags WHERE message_id = m.id AND tag = $4)`
      : '';

    const query = `SELECT m.id, m.message_id, m.subject, m.from_addr, m.to_addrs, m.received_at, m.mailbox,
             COALESCE(json_agg(mt.tag ORDER BY mt.tag) FILTER (WHERE mt.tag IS NOT NULL), '[]') as tags
             FROM messages m
             LEFT JOIN message_tags mt ON mt.message_id = m.id
             ${trash.join}
             WHERE m.mailbox = $1
             ${tagExists}
             ${trash.where}
             GROUP BY m.id
             ORDER BY m.received_at DESC
             LIMIT $2 OFFSET $3`;

    const { rows } = await pool.query(query, params);

    // Count uses the same trash filter, with its own param array.
    const countParams = [requestedMailbox];
    if (tag) countParams.push(tag);
    const cTrash = buildTrashFilter(requestedMailbox, viewerUser, trashOnly, countParams);
    const countQuery = tag
      ? `SELECT COUNT(DISTINCT m.id) AS total FROM messages m
         JOIN message_tags mt ON mt.message_id = m.id
         ${cTrash.join}
         WHERE m.mailbox = $1 AND mt.tag = $2 ${cTrash.where}`
      : `SELECT COUNT(*) AS total FROM messages m
         ${cTrash.join}
         WHERE m.mailbox = $1 ${cTrash.where}`;
    const { rows: countRows } = await pool.query(countQuery, countParams);

    res.json({ messages: rows, total: parseInt(countRows[0].total), page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

router.get('/messages/:id', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;

  const id = parseMessageId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'invalid id' });

  try {
    const { rows } = await pool.query('SELECT * FROM messages WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });

    const msg = rows[0];
    if (!canReadMessage(msg.mailbox, viewerUser)) {
      return res.status(404).json({ error: 'not found' });
    }

    // Attach tags
    const { rows: tagRows } = await pool.query(
      'SELECT tag, source FROM message_tags WHERE message_id = $1 ORDER BY tag',
      [id]
    );
    msg.tags = tagRows.map(r => r.tag);

    res.json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

/**
 * GET /messages/:id/attachments/:idx
 * Streams the binary content of a single attachment.
 * Auth: same VIEWER_SECRET + X-Viewer-User token as message fetch.
 */
router.get('/messages/:id/attachments/:idx', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;

  const id = parseMessageId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'invalid id' });

  const idx = parseInt(req.params.idx, 10);
  if (!Number.isFinite(idx) || idx < 0) return res.status(400).json({ error: 'invalid idx' });

  try {
    // Verify the viewer can read this message (reuses existing access control).
    const { rows: msgRows } = await pool.query(
      'SELECT mailbox, attachments_meta FROM messages WHERE id = $1',
      [id]
    );
    if (!msgRows.length) return res.status(404).json({ error: 'not found' });
    const msg = msgRows[0];
    if (!canReadMessage(msg.mailbox, viewerUser)) return res.status(404).json({ error: 'not found' });

    const meta = msg.attachments_meta?.[idx];
    if (!meta) return res.status(404).json({ error: 'attachment not found' });

    // Guard: reject attachments whose stored size would blow the Node heap.
    // 20 MB is a safe ceiling for in-memory BYTEA; larger files should use
    // object storage (not yet wired).
    const MAX_BYTES = 20 * 1024 * 1024;
    if (meta.size > MAX_BYTES) {
      return res.status(413).json({ error: 'attachment too large for inline delivery' });
    }

    const { rows: dataRows } = await pool.query(
      'SELECT data FROM attachment_data WHERE message_id = $1 AND idx = $2',
      [id, idx]
    );
    if (!dataRows.length) return res.status(404).json({ error: 'attachment data not stored' });

    const contentType = meta.contentType || 'application/octet-stream';
    const rawFilename = meta.filename || `attachment-${idx}`;
    // Strip control characters (incl. CR/LF) to prevent header injection.
    // eslint-disable-next-line no-control-regex
    const filename = rawFilename.replace(/[\x00-\x1f\x7f"]/g, '');
    // For previewable types serve inline; others force download.
    const PREVIEWABLE = /^(image\/(jpeg|png|gif|webp|svg\+xml)|application\/pdf|text\/.+)$/i;
    const disposition = PREVIEWABLE.test(contentType)
      ? `inline; filename="${filename}"`
      : `attachment; filename="${filename}"`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('Content-Length', dataRows[0].data.length);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(dataRows[0].data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
