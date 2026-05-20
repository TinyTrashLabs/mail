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

/**
 * Resolve viewer username from the signed X-Viewer-User token.
 * Returns the verified username (possibly empty string for "anonymous" shared-only),
 * or null if the token is present-but-invalid (which we treat as a hard 401).
 */
function resolveViewerUser(req, res) {
  const header = req.headers['x-viewer-user'];
  if (header === undefined) {
    // No token at all — treat as anonymous (shared mailbox only).
    return '';
  }
  if (typeof header !== 'string' || header === '') return '';
  const user = verifyViewerToken(header);
  if (user === null) {
    res.status(401).json({ error: 'invalid viewer token' });
    return null;
  }
  return user;
}

router.get('/messages', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;

  const requestedMailbox = req.query.mailbox || 'shared';
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  if (!canAccessMailbox(requestedMailbox, viewerUser)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, message_id, subject, from_addr, to_addrs, received_at, mailbox
       FROM messages
       WHERE mailbox = $1
       ORDER BY received_at DESC
       LIMIT $2 OFFSET $3`,
      [requestedMailbox, limit, offset]
    );
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) AS total FROM messages WHERE mailbox = $1',
      [requestedMailbox]
    );
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
  if (id === null) {
    return res.status(400).json({ error: 'invalid id' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM messages WHERE id = $1',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });

    const msg = rows[0];
    if (!canReadMessage(msg.mailbox, viewerUser)) {
      // 404 not 403 — don't leak existence of messages outside the viewer's scope
      return res.status(404).json({ error: 'not found' });
    }

    res.json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
