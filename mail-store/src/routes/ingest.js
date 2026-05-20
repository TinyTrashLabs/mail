import { Router } from 'express';
import { simpleParser } from 'mailparser';
import { pool } from '../db.js';
import { extractFields } from '../ingest-fields.js';

const router = Router();

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
    // Return existing id on duplicate instead of null
    let id = result.rows[0]?.id ?? null;
    const duplicate = result.rows.length === 0;
    if (id === null && f.messageId) {
      const existing = await pool.query(
        'SELECT id FROM messages WHERE message_id = $1',
        [f.messageId]
      );
      id = existing.rows[0]?.id ?? null;
    }
    res.json({ id, mailbox: f.mailbox, duplicate });
  } catch (err) {
    console.error('DB insert error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
