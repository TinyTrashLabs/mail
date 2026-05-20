import { Router } from 'express';
import { simpleParser } from 'mailparser';
import { pool } from '../db.js';
import { resolveMailbox } from '../mailbox.js';

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

  const mailbox = resolveMailbox(envelope_to);
  const messageId = parsed.messageId || null;
  const toAddrs = (parsed.to?.value || []).map(a => ({ name: a.name, address: a.address }));
  const ccAddrs = (parsed.cc?.value || []).map(a => ({ name: a.name, address: a.address }));
  const attachmentsMeta = (parsed.attachments || []).map(a => ({
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
  }));

  try {
    const result = await pool.query(
      `INSERT INTO messages
        (message_id, in_reply_to, subject, from_addr, to_addrs, cc_addrs,
         received_at, text_body, html_body, attachments_meta, mailbox)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING id`,
      [
        messageId,
        parsed.inReplyTo || null,
        parsed.subject || '(no subject)',
        parsed.from?.text || envelope_from || '',
        JSON.stringify(toAddrs),
        JSON.stringify(ccAddrs),
        parsed.date || new Date(),
        parsed.text || null,
        parsed.html || null,
        JSON.stringify(attachmentsMeta),
        mailbox,
      ]
    );
    // Fix: return existing id on duplicate instead of null
    let id = result.rows[0]?.id ?? null;
    if (id === null && messageId) {
      const existing = await pool.query(
        'SELECT id FROM messages WHERE message_id = $1',
        [messageId]
      );
      id = existing.rows[0]?.id ?? null;
    }
    res.json({ id, mailbox, duplicate: result.rows.length === 0 });
  } catch (err) {
    console.error('DB insert error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

export default router;
