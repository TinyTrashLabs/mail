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

// Columns the PATCH endpoint accepts and inserts. Adding a new boolean state
// flag is now a one-line change here.
const PATCH_COLUMNS = ['is_read', 'is_starred', 'is_trashed'];

/**
 * PATCH /message-states/:id
 * Body: { is_read?: boolean, is_starred?: boolean, is_trashed?: boolean }
 * Upserts per-user message state. Returns the updated state row.
 * Route uses /message-states (not /messages/:id/state) to avoid any
 * ordering dependency with messagesRouter's /messages/:id GET route.
 *
 * Shared trash: when a message in the 'shared' mailbox has is_trashed set,
 * we also write is_globally_trashed on the messages row so all viewers see
 * the message removed from shared — not just the user who trashed it.
 */
router.patch('/message-states/:id', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;
  if (!viewerUser) return res.status(403).json({ error: 'viewer token required' });

  const id = parseMessageId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'invalid id' });

  // Validate body — only allow known boolean fields from PATCH_COLUMNS allowlist.
  const body = req.body || {};
  const patch = {};
  for (const col of PATCH_COLUMNS) {
    if (body[col] === undefined) continue;
    if (typeof body[col] !== 'boolean') {
      return res.status(400).json({ error: `${col} must be boolean` });
    }
    patch[col] = body[col];
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'no fields to update' });
  }

  try {
    // Verify message exists and viewer can access it
    const { rows } = await pool.query('SELECT mailbox FROM messages WHERE id = $1', [id]);
    if (!rows.length || !canReadMessage(rows[0].mailbox, viewerUser)) {
      return res.status(404).json({ error: 'not found' });
    }
    const mailbox = rows[0].mailbox;

    // Build INSERT column list with $-params for each PATCH_COLUMNS member.
    // For columns not in the patch, insert FALSE (the schema default) so the
    // initial row has all flags explicitly false.
    const insertCols = ['username', 'message_id', ...PATCH_COLUMNS];
    const values = [viewerUser, id];
    const insertParams = ['$1', '$2'];
    const updateSets = [];
    for (const col of PATCH_COLUMNS) {
      if (col in patch) {
        values.push(patch[col]);
        const p = `$${values.length}`;
        insertParams.push(p);
        updateSets.push(`${col} = ${p}`);
      } else {
        insertParams.push('FALSE');
      }
    }
    updateSets.push('updated_at = NOW()');

    const returningCols = PATCH_COLUMNS.join(', ');
    const result = await pool.query(
      `INSERT INTO message_state (${insertCols.join(', ')})
         VALUES (${insertParams.join(', ')})
       ON CONFLICT (username, message_id) DO UPDATE
         SET ${updateSets.join(', ')}
       RETURNING ${returningCols}`,
      values
    );

    // Shared trash: propagate is_trashed to the global flag on the message row
    // so all users see the message removed from the shared inbox, not just the
    // user who trashed it. Restoring (is_trashed=false) also clears the global flag.
    if (mailbox === 'shared' && 'is_trashed' in patch) {
      await pool.query(
        'UPDATE messages SET is_globally_trashed = $1 WHERE id = $2',
        [patch.is_trashed, id]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

/**
 * GET /message-states?ids=1,2,3
 * Returns state rows for the requested message ids for the viewer user.
 * Missing rows (never updated) are returned with defaults is_read=false, is_starred=false.
 */
router.get('/message-states', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const viewerUser = resolveViewerUser(req, res);
  if (viewerUser === null) return;
  if (!viewerUser) return res.json({});

  const rawIds = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!rawIds.length) return res.json({});

  const ids = rawIds.map(parseMessageId).filter(id => id !== null);
  if (!ids.length) return res.json({});

  try {
    const selectCols = ['message_id', ...PATCH_COLUMNS].join(', ');
    const { rows } = await pool.query(
      `SELECT ${selectCols}
         FROM message_state
        WHERE username = $1 AND message_id = ANY($2::bigint[])`,
      [viewerUser, ids]
    );

    // Return map: { [id]: { is_read, is_starred, is_trashed } }
    const stateMap = {};
    for (const row of rows) {
      const entry = {};
      for (const col of PATCH_COLUMNS) entry[col] = row[col];
      stateMap[String(row.message_id)] = entry;
    }
    res.json(stateMap);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
