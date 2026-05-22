import { Router } from 'express';
import { pool } from '../db.js';
import { canReadMessage } from '../access.js';
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
 * Same logic as messages.js: invalid token → 401 (return null to signal
 * caller should abort), absent token → anonymous empty-string user.
 */
function resolveViewerUser(req, res) {
  const header = req.headers['x-viewer-user'];
  if (header === undefined || header === '') return '';
  const user = verifyViewerToken(header);
  if (user === null) {
    res.status(401).json({ error: 'invalid viewer token' });
    return null;
  }
  return user;
}

// GET /messages/:id/tags
router.get('/messages/:id/tags', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rows } = await pool.query(
      'SELECT tag, source FROM message_tags WHERE message_id = $1 ORDER BY tag',
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// POST /messages/:id/tags  { tags: string[], source: 'ai'|'user' }
// Max 20 tags per message, 32 chars each. Auth required.
router.post('/messages/:id/tags', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;

  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  const rawTags = Array.isArray(req.body.tags) ? req.body.tags : [];
  const tags = rawTags
    .map(t => String(t).toLowerCase().trim().slice(0, 32))
    .filter(Boolean)
    .slice(0, 20); // cap at 20 tags per request
  const source = req.body.source === 'user' ? 'user' : 'ai';

  if (!tags.length) return res.status(400).json({ error: 'tags required' });

  try {
    const { rows } = await pool.query('SELECT mailbox FROM messages WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    if (!canReadMessage(rows[0].mailbox, viewerUser)) return res.status(403).json({ error: 'forbidden' });

    // Check existing tag count to enforce per-message cap of 50
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) as c FROM message_tags WHERE message_id = $1',
      [id]
    );
    const existing = parseInt(countRows[0].c);
    if (existing + tags.length > 50) {
      return res.status(400).json({ error: 'too many tags on this message' });
    }

    for (const tag of tags) {
      await pool.query(
        `INSERT INTO message_tags (message_id, tag, source) VALUES ($1, $2, $3)
         ON CONFLICT (message_id, tag) DO UPDATE SET source = EXCLUDED.source`,
        [id, tag, source]
      );
    }
    res.json({ ok: true, tags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /tags?mailbox=shared
router.get('/tags', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const mailbox = req.query.mailbox || 'shared';
  try {
    const { rows } = await pool.query(
      `SELECT mt.tag, COUNT(*) as count
       FROM message_tags mt
       JOIN messages m ON mt.message_id = m.id
       WHERE m.mailbox = $1
       GROUP BY mt.tag
       ORDER BY count DESC, mt.tag`,
      [mailbox]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
