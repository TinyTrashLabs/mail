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

export default router;
