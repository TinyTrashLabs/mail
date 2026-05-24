import { Router } from 'express';
import { pool } from '../db.js';
import { verifyViewerToken } from '../viewer-token.js';
import { PERSONAL, sentMailboxFor } from '../mailbox.js';

const router = Router();

/**
 * Persist a record of a message the viewer just sent.
 *
 * Auth: same VIEWER_SECRET + X-Viewer-User token pair used by every other
 * viewer-side endpoint. The viewer's send route calls this AFTER Resend
 * confirms delivery; the resulting row lives in `<username>-sent`.
 *
 * Body:
 *   { messageId?, from, to:[], cc:[], bcc:[], subject, text, html?, sentAt? }
 *
 * - messageId: Resend message id (used to dedupe re-tries; goes into the
 *   message_id column).
 * - from: should match `<username>@...`; we still scope mailbox by viewer.
 */
router.post('/sent', async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.VIEWER_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const tokenHdr = req.headers['x-viewer-user'];
  if (typeof tokenHdr !== 'string' || !tokenHdr) {
    return res.status(401).json({ error: 'viewer token required' });
  }
  const viewerUser = verifyViewerToken(tokenHdr);
  if (viewerUser === null) {
    return res.status(401).json({ error: 'invalid viewer token' });
  }
  if (!PERSONAL.has(viewerUser)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const {
    messageId, from, to, cc, bcc, subject, text, html, sentAt,
  } = req.body || {};

  if (!from || typeof from !== 'string') {
    return res.status(400).json({ error: 'from required' });
  }
  if (!Array.isArray(to) || to.length === 0) {
    return res.status(400).json({ error: 'to (array) required' });
  }
  if (typeof subject !== 'string') {
    return res.status(400).json({ error: 'subject required' });
  }
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'text required' });
  }

  const mailbox = sentMailboxFor(viewerUser);
  // Synthesize a deterministic message-id for dedup when Resend didn't give us one.
  // Resend returns ids like `b35... uuid`; we wrap them as RFC-shaped Message-ID.
  const safeId = messageId
    ? `<${String(messageId).replace(/[\r\n<>]/g, '')}@resend>`
    : `<sent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@${process.env.RESEND_FROM_DOMAIN || 'tinytrashlabs.com'}>`;

  const ts = sentAt ? new Date(sentAt) : new Date();

  try {
    const result = await pool.query(
      `INSERT INTO messages
         (message_id, in_reply_to, subject, from_addr, to_addrs, cc_addrs,
          received_at, text_body, html_body, attachments_meta, mailbox)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING id`,
      [
        safeId,
        null,
        subject,
        from,
        JSON.stringify(Array.isArray(to) ? to : [to]),
        JSON.stringify(Array.isArray(cc) ? cc : []),
        ts,
        text,
        html || null,
        JSON.stringify([]),
        mailbox,
      ]
    );

    let id = result.rows[0]?.id ?? null;
    const duplicate = result.rows.length === 0;
    if (id === null) {
      const existing = await pool.query(
        'SELECT id FROM messages WHERE message_id = $1',
        [safeId]
      );
      id = existing.rows[0]?.id ?? null;
    }
    // Discard bcc from the visible row (privacy: BCC recipients should
    // not be reconstructable from someone else's sent view), but we DO
    // store the count for future "I sent this to N people including bccs"
    // UX. Easiest: skip persisting bcc altogether.
    void bcc;
    res.json({ id, mailbox, duplicate });
  } catch (err) {
    console.error('Sent insert error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
