import { Router } from 'express';
import { pool } from '../db.js';
import { canReadMessage, parseMessageId } from '../access.js';
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
  if (!header || header === '') return '';
  const user = verifyViewerToken(header);
  if (user === null) {
    res.status(401).json({ error: 'invalid viewer token' });
    return null;
  }
  return user;
}

/**
 * PATCH /messages/:id/state
 * Body: { is_read?: boolean, is_starred?: boolean }
 * Upserts per-user message state. Returns the updated state row.
 */
router.patch('/messages/:id/state', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;
  if (!viewerUser) return res.status(403).json({ error: 'viewer token required' });

  const id = parseMessageId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'invalid id' });

  // Validate body — only allow known boolean fields
  const { is_read, is_starred } = req.body || {};
  if (is_read === undefined && is_starred === undefined) {
    return res.status(400).json({ error: 'no fields to update' });
  }
  if (is_read !== undefined && typeof is_read !== 'boolean') {
    return res.status(400).json({ error: 'is_read must be boolean' });
  }
  if (is_starred !== undefined && typeof is_starred !== 'boolean') {
    return res.status(400).json({ error: 'is_starred must be boolean' });
  }

  try {
    // Verify message exists and viewer can access it
    const { rows } = await pool.query('SELECT mailbox FROM messages WHERE id = $1', [id]);
    if (!rows.length || !canReadMessage(rows[0].mailbox, viewerUser)) {
      return res.status(404).json({ error: 'not found' });
    }

    // Build upsert with explicit positional params — never use indexOf on booleans.
    // values[0]=username ($1), values[1]=id ($2), then optional is_read ($3?), is_starred ($4/$3?)
    const values = [viewerUser, id];
    const sets = [];

    let readParam = 'FALSE';
    if (is_read !== undefined) {
      values.push(is_read);
      readParam = `$${values.length}`;
      sets.push(`is_read = ${readParam}`);
    }

    let starredParam = 'FALSE';
    if (is_starred !== undefined) {
      values.push(is_starred);
      starredParam = `$${values.length}`;
      sets.push(`is_starred = ${starredParam}`);
    }

    sets.push('updated_at = NOW()');

    const result = await pool.query(
      `INSERT INTO message_state (username, message_id, is_read, is_starred)
         VALUES ($1, $2, ${readParam}, ${starredParam})
       ON CONFLICT (username, message_id) DO UPDATE
         SET ${sets.join(', ')}
       RETURNING is_read, is_starred`,
      values
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

/**
 * GET /messages/state?ids=1,2,3
 * Returns state rows for the requested message ids for the viewer user.
 * Missing rows (never updated) are returned with defaults is_read=false, is_starred=false.
 */
router.get('/messages/state', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;
  if (!viewerUser) return res.json({});

  const rawIds = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!rawIds.length) return res.json({});

  const ids = rawIds.map(parseMessageId).filter(id => id !== null);
  if (!ids.length) return res.json({});

  try {
    const { rows } = await pool.query(
      `SELECT message_id, is_read, is_starred
         FROM message_state
        WHERE username = $1 AND message_id = ANY($2::bigint[])`,
      [viewerUser, ids]
    );

    // Return map: { [id]: { is_read, is_starred } }
    const stateMap = {};
    for (const row of rows) {
      stateMap[String(row.message_id)] = { is_read: row.is_read, is_starred: row.is_starred };
    }
    res.json(stateMap);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
