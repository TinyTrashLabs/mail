import { Router } from 'express';
import { simpleParser } from 'mailparser';
import { pool } from '../db.js';
import { extractFields } from '../ingest-fields.js';
import { PERSONAL } from '../mailbox.js';

const router = Router();

/**
 * Fire-and-forget: post a new-mail notification to the mailbox owner's
 * Mattermost DM channel via the MM REST API.
 *
 * Required env vars (all optional — if absent, skipped silently):
 *   MM_BASE_URL        e.g. https://mm.tinytrashlabs.com
 *   MM_BOT_TOKEN       PAT for the @patch bot
 *   MAIL_VIEWER_URL    e.g. https://mail.tinytrashlabs.com  (for inbox link)
 */
async function notifyNewMail({ mailbox, subject, fromAddr, messageId }) {
  const base = process.env.MM_BASE_URL;
  const token = process.env.MM_BOT_TOKEN;
  if (!base || !token) return;

  // Guard 1: only notify for known personal mailboxes (PERSONAL is an explicit Set)
  if (!PERSONAL.has(mailbox)) return;
  // Guard 2: enforce safe identifier shape — PERSONAL values are hand-curated but
  // this ensures nothing unusual can reach the MM URL even if the set drifts.
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(mailbox)) return;

  try {
    // Resolve MM user by username
    const userRes = await fetch(`${base}/api/v4/users/username/${encodeURIComponent(mailbox)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) {
      console.warn(`[mail-notify] MM user not found for mailbox ${mailbox}: ${userRes.status}`);
      return;
    }
    const user = await userRes.json();

    // Get bot identity
    const botRes = await fetch(`${base}/api/v4/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!botRes.ok) return;
    const bot = await botRes.json();

    // Open / resolve DM channel
    const dmRes = await fetch(`${base}/api/v4/channels/direct`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([bot.id, user.id]),
    });
    if (!dmRes.ok) {
      console.warn(`[mail-notify] DM channel open failed for ${mailbox}: ${dmRes.status}`);
      return;
    }
    const dm = await dmRes.json();

    // Build notification message
    const viewerBase = process.env.MAIL_VIEWER_URL || 'https://mail.tinytrashlabs.com';
    // Neutralize Markdown special chars in untrusted fields to prevent link injection.
    const escapeMd = (s) => s.replace(/[[\]`\\]/g, '\\$&').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const from = escapeMd(fromAddr || '(unknown)');
    const subj = escapeMd(subject || '(no subject)');
    const msgId = messageId ? `?mailbox=${encodeURIComponent(mailbox)}&msg=${messageId}` : `?mailbox=${encodeURIComponent(mailbox)}`;
    const inboxUrl = `${viewerBase}/inbox${msgId}`;
    const message = `📬 New mail in **${mailbox}**\n**From:** ${from}\n**Subject:** ${subj}\n[Open →](${inboxUrl})`;

    await fetch(`${base}/api/v4/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: dm.id, message }),
    });
  } catch (err) {
    console.warn('[mail-notify] notification error:', err.message);
  }
}

router.post('/ingest', async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.INGEST_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { raw, envelope_from, envelope_to } = req.body;
  if (!raw) return res.status(400).json({ error: 'raw required' });

  let parsed;
  try {
    const buf = Buffer.from(raw, 'base64');
    parsed = await simpleParser(buf);
  } catch (err) {
    return res.status(400).json({ error: `parse failed: ${err.message}` });
  }

  const f = extractFields(parsed, envelope_from, envelope_to);

  try {
    const result = await pool.query(
      `INSERT INTO messages
        (message_id, in_reply_to, subject, from_addr, to_addrs, cc_addrs,
         received_at, text_body, html_body, attachments_meta, mailbox)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING id`,
      [
        f.messageId,
        f.inReplyTo,
        f.subject,
        f.fromAddr,
        JSON.stringify(f.toAddrs),
        JSON.stringify(f.ccAddrs),
        f.receivedAt,
        f.textBody,
        f.htmlBody,
        JSON.stringify(f.attachmentsMeta),
        f.mailbox,
      ]
    );
    let id = result.rows[0]?.id ?? null;
    const duplicate = result.rows.length === 0;
    if (id === null && f.messageId) {
      const existing = await pool.query(
        'SELECT id FROM messages WHERE message_id = $1',
        [f.messageId]
      );
      id = existing.rows[0]?.id ?? null;
    }

    // Notify mailbox owner — fire-and-forget, never blocks response
    if (!duplicate) {
      notifyNewMail({ mailbox: f.mailbox, subject: f.subject, fromAddr: f.fromAddr, messageId: id });
    }

    res.json({ id, mailbox: f.mailbox, duplicate });
  } catch (err) {
    console.error('DB insert error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
