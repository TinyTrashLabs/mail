import { Router } from 'express';
import { pool } from '../db.js';
import { canReadMessage, canWriteMessage, canWriteToMailbox, canAccessMailbox } from '../access.js';
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
    if (!canWriteMessage(rows[0].mailbox, viewerUser)) return res.status(403).json({ error: 'forbidden' });

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

// DELETE /messages/:id/tags/:tag — remove a single tag from a message.
router.delete('/messages/:id/tags/:tag', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;

  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const tag = String(req.params.tag || '').toLowerCase().trim();
  if (!tag || tag.length > 32) return res.status(400).json({ error: 'invalid tag' });

  try {
    const { rows } = await pool.query('SELECT mailbox FROM messages WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    if (!canWriteMessage(rows[0].mailbox, viewerUser)) return res.status(403).json({ error: 'forbidden' });
    await pool.query('DELETE FROM message_tags WHERE message_id = $1 AND tag = $2', [id, tag]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// PATCH /tags?mailbox=...  { from: 'oldtag', to: 'newtag' }
// Rename a tag across every message in a mailbox (scoped — no cross-mailbox renames).
router.patch('/tags', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;

  const mailbox = typeof req.query.mailbox === 'string' && req.query.mailbox ? req.query.mailbox : 'shared';
  if (!canWriteToMailbox(mailbox, viewerUser)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const from = String(req.body?.from || '').toLowerCase().trim();
  const to = String(req.body?.to || '').toLowerCase().trim();
  if (!from || !to || from.length > 32 || to.length > 32) {
    return res.status(400).json({ error: 'invalid from/to' });
  }
  if (from === to) return res.json({ ok: true, renamed: 0 });

  try {
    // Two-step rename: insert new tag on matching messages, then delete old tag.
    // ON CONFLICT DO NOTHING avoids duplicate-key blowups when both tags
    // already coexist on a message.
    const insertSql = `
      INSERT INTO message_tags (message_id, tag, source)
      SELECT mt.message_id, $1, mt.source
      FROM message_tags mt
      JOIN messages m ON m.id = mt.message_id
      WHERE m.mailbox = $2 AND mt.tag = $3
      ON CONFLICT (message_id, tag)
      DO UPDATE SET source = CASE
        WHEN message_tags.source = 'user' OR EXCLUDED.source = 'user' THEN 'user'
        ELSE message_tags.source
      END
    `;
    await pool.query(insertSql, [to, mailbox, from]);

    const deleteSql = `
      DELETE FROM message_tags
      WHERE tag = $1
        AND message_id IN (SELECT id FROM messages WHERE mailbox = $2)
    `;
    const result = await pool.query(deleteSql, [from, mailbox]);
    res.json({ ok: true, renamed: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// DELETE /tags?mailbox=...&tag=foo — remove a tag from every message in a mailbox.
router.delete('/tags', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;

  const mailbox = typeof req.query.mailbox === 'string' && req.query.mailbox ? req.query.mailbox : 'shared';
  if (!canWriteToMailbox(mailbox, viewerUser)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const tag = String(req.query.tag || '').toLowerCase().trim();
  if (!tag) return res.status(400).json({ error: 'tag required' });

  try {
    const result = await pool.query(
      `DELETE FROM message_tags
       WHERE tag = $1
         AND message_id IN (SELECT id FROM messages WHERE mailbox = $2)`,
      [tag, mailbox]
    );
    res.json({ ok: true, deleted: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /tags?mailbox=shared
router.get('/tags', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;
  const mailbox = typeof req.query.mailbox === 'string' && req.query.mailbox ? req.query.mailbox : 'shared';
  if (!canAccessMailbox(mailbox, viewerUser)) {
    return res.status(403).json({ error: 'forbidden' });
  }
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
