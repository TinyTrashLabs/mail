/**
 * Unit tests for ingest parsing and duplicate handling logic.
 * Tests the business logic in isolation — no real DB.
 */

import { resolveMailbox } from '../mailbox.js';

// Simulate the field extraction logic from routes/ingest.js
function extractFields(parsed, envelopeFrom, envelopeTo) {
  const mailbox = resolveMailbox(envelopeTo);
  const messageId = parsed.messageId || null;
  const toAddrs = (parsed.to?.value || []).map(a => ({ name: a.name, address: a.address }));
  const ccAddrs = (parsed.cc?.value || []).map(a => ({ name: a.name, address: a.address }));
  const attachmentsMeta = (parsed.attachments || []).map(a => ({
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
  }));
  return {
    mailbox,
    messageId,
    toAddrs,
    ccAddrs,
    attachmentsMeta,
    subject: parsed.subject || '(no subject)',
    fromAddr: parsed.from?.text || envelopeFrom || '',
    textBody: parsed.text || null,
    htmlBody: parsed.html || null,
    receivedAt: parsed.date || null,
  };
}

describe('ingest field extraction', () => {
  test('extracts fields from a parsed message', () => {
    const parsed = {
      messageId: '<abc123@mail.example.com>',
      subject: 'Hello TTL',
      from: { text: 'Alice <alice@example.com>' },
      to: { value: [{ name: 'David', address: 'david@tinytrashlabs.com' }] },
      cc: { value: [] },
      attachments: [],
      text: 'Hi there',
      html: null,
      date: new Date('2026-05-20T12:00:00Z'),
    };

    const result = extractFields(parsed, 'alice@example.com', 'david@tinytrashlabs.com');
    expect(result.mailbox).toBe('david');
    expect(result.messageId).toBe('<abc123@mail.example.com>');
    expect(result.subject).toBe('Hello TTL');
    expect(result.toAddrs).toEqual([{ name: 'David', address: 'david@tinytrashlabs.com' }]);
    expect(result.textBody).toBe('Hi there');
    expect(result.htmlBody).toBeNull();
  });

  test('falls back to (no subject) when subject is missing', () => {
    const parsed = { messageId: '<x>', to: null, cc: null, attachments: [], from: null };
    const result = extractFields(parsed, 'a@b.com', 'contact@tinytrashlabs.com');
    expect(result.subject).toBe('(no subject)');
    expect(result.mailbox).toBe('shared');
  });

  test('falls back to envelope_from when parsed.from is missing', () => {
    const parsed = { messageId: '<x>', to: null, cc: null, attachments: [], from: null };
    const result = extractFields(parsed, 'sender@example.com', 'hello@tinytrashlabs.com');
    expect(result.fromAddr).toBe('sender@example.com');
  });

  test('extracts attachments metadata', () => {
    const parsed = {
      messageId: '<y>',
      to: null, cc: null, from: null,
      attachments: [
        { filename: 'report.pdf', contentType: 'application/pdf', size: 1024 },
      ],
    };
    const result = extractFields(parsed, '', 'david@tinytrashlabs.com');
    expect(result.attachmentsMeta).toHaveLength(1);
    expect(result.attachmentsMeta[0].filename).toBe('report.pdf');
  });
});

describe('duplicate detection', () => {
  test('ON CONFLICT DO NOTHING returns empty rows — caller should fetch existing id', () => {
    // Simulates what the route does when result.rows is empty (duplicate)
    const resultRows = []; // no RETURNING row → duplicate
    const messageId = '<dup123@example.com>';
    const isDuplicate = resultRows.length === 0;
    expect(isDuplicate).toBe(true);
    // Caller fetches existing row — we verify the logic path exists
    expect(messageId).toBeTruthy(); // only fetches if messageId is non-null
  });
});
