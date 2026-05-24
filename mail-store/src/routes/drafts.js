import { Router } from 'express';
import { pool } from '../db.js';
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
  if (!header || typeof header !== 'string') {
    res.status(401).json({ error: 'viewer token required' });
    return null;
  }
  const user = verifyViewerToken(header);
  if (user === null) {
    res.status(401).json({ error: 'invalid viewer token' });
    return null;
  }
  return user;
}

// GET /drafts — list all drafts for the authenticated user
router.get('/drafts', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const username = resolveViewerUser(req, res);
  if (username === null) return;

  try {
    const { rows } = await pool.query(
      `SELECT id, username, to_addrs, cc_addrs, bcc_addrs, subject, updated_at
       FROM drafts WHERE username = $1 ORDER BY updated_at DESC`,
      [username]
    );
    res.json({ drafts: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /drafts/:id — fetch a single draft (full body)
router.get('/drafts/:id', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const username = resolveViewerUser(req, res);
  if (username === null) return;

  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM drafts WHERE id = $1 AND username = $2',
      [id, username]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// POST /drafts — create a new draft
router.post('/drafts', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const username = resolveViewerUser(req, res);
  if (username === null) return;

  const {
    to = '', cc = '', bcc = '', subject = '',
    text = '', html = null, inReplyTo = null,
  } = req.body || {};

  try {
    const { rows } = await pool.query(
      `INSERT INTO drafts (username, to_addrs, cc_addrs, bcc_addrs, subject, text_body, html_body, in_reply_to, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, updated_at`,
      [username, String(to).slice(0, 2000), String(cc).slice(0, 2000), String(bcc).slice(0, 2000),
       String(subject).slice(0, 1000), String(text).slice(0, 500000),
       html ? String(html).slice(0, 1000000) : null,
       inReplyTo ? String(inReplyTo).slice(0, 512) : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// PATCH /drafts/:id — update an existing draft
router.patch('/drafts/:id', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const username = resolveViewerUser(req, res);
  if (username === null) return;

  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

  const {
    to, cc, bcc, subject, text, html, inReplyTo,
  } = req.body || {};

  // Only set columns provided in the body
  const sets = [];
  const params = [id, username];
  function maybeSet(col, val, maxLen) {
    if (val !== undefined) {
      params.push(String(val).slice(0, maxLen));
      sets.push(`${col} = $${params.length}`);
    }
  }
  maybeSet('to_addrs', to, 2000);
  maybeSet('cc_addrs', cc, 2000);
  maybeSet('bcc_addrs', bcc, 2000);
  maybeSet('subject', subject, 1000);
  maybeSet('text_body', text, 500000);
  if (html !== undefined) {
    params.push(html ? String(html).slice(0, 1000000) : null);
    sets.push(`html_body = $${params.length}`);
  }
  if (inReplyTo !== undefined) {
    params.push(inReplyTo ? String(inReplyTo).slice(0, 512) : null);
    sets.push(`in_reply_to = $${params.length}`);
  }

  if (sets.length === 0) return res.status(400).json({ error: 'no fields to update' });
  sets.push('updated_at = NOW()');

  try {
    const { rows } = await pool.query(
      `UPDATE drafts SET ${sets.join(', ')} WHERE id = $1 AND username = $2 RETURNING id, updated_at`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// DELETE /drafts/:id — delete a draft (on send or explicit discard)
router.delete('/drafts/:id', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const username = resolveViewerUser(req, res);
  if (username === null) return;

  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

  try {
    await pool.query('DELETE FROM drafts WHERE id = $1 AND username = $2', [id, username]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
