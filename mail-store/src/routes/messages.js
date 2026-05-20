import { Router } from 'express';
import { pool } from '../db.js';
import { PERSONAL } from '../mailbox.js';

const router = Router();

function checkAuth(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.VIEWER_SECRET}`) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

router.get('/messages', async (req, res) => {
  if (!checkAuth(req, res)) return;

  const requestedMailbox = req.query.mailbox || 'shared';
  const viewerUser = req.query.viewer_user || '';
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  // Enforce mailbox access: personal mailboxes only accessible by matching user
  const allowed =
    requestedMailbox === 'shared' ||
    (PERSONAL.has(requestedMailbox) && requestedMailbox === viewerUser);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });

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

  const viewerUser = req.query.viewer_user || '';

  try {
    const { rows } = await pool.query(
      'SELECT * FROM messages WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });

    const msg = rows[0];
    // Enforce ownership: personal mailbox only accessible by its owner
    const allowed =
      msg.mailbox === 'shared' ||
      (PERSONAL.has(msg.mailbox) && msg.mailbox === viewerUser);
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    res.json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
