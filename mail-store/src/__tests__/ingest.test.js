/**
 * Tests for the real ingest field-extraction logic imported from
 * src/ingest-fields.js — the same function the route handler uses.
 */

import { extractFields } from '../ingest-fields.js';

describe('extractFields', () => {
  test('full message → all fields populated, mailbox resolved to owner', () => {
    const parsed = {
      messageId: '<abc123@mail.example.com>',
      inReplyTo: '<parent@example.com>',
      subject: 'Hello TTL',
      from: { text: 'Alice <alice@example.com>' },
      to: { value: [{ name: 'David', address: 'david@tinytrashlabs.com' }] },
      cc: { value: [{ name: 'Shane', address: 'shane@tinytrashlabs.com' }] },
      attachments: [
        { filename: 'report.pdf', contentType: 'application/pdf', size: 1024 },
      ],
      text: 'Hi there',
      html: '<p>Hi there</p>',
      date: new Date('2026-05-20T12:00:00Z'),
    };

    const f = extractFields(parsed, 'alice@example.com', 'david@tinytrashlabs.com');
    expect(f.mailbox).toBe('david');
    expect(f.messageId).toBe('<abc123@mail.example.com>');
    expect(f.inReplyTo).toBe('<parent@example.com>');
    expect(f.subject).toBe('Hello TTL');
    expect(f.fromAddr).toBe('Alice <alice@example.com>');
    expect(f.toAddrs).toEqual([{ name: 'David', address: 'david@tinytrashlabs.com' }]);
    expect(f.ccAddrs).toEqual([{ name: 'Shane', address: 'shane@tinytrashlabs.com' }]);
    expect(f.textBody).toBe('Hi there');
    expect(f.htmlBody).toBe('<p>Hi there</p>');
    expect(f.attachmentsMeta).toEqual([
      { filename: 'report.pdf', contentType: 'application/pdf', size: 1024 },
    ]);
  });

  test('missing subject → (no subject) sentinel', () => {
    const parsed = { messageId: '<x>', to: null, cc: null, attachments: [], from: null };
    const f = extractFields(parsed, 'a@b.com', 'contact@tinytrashlabs.com');
    expect(f.subject).toBe('(no subject)');
    expect(f.mailbox).toBe('shared');
  });

  test('missing parsed.from → envelope_from fallback', () => {
    const parsed = { messageId: '<x>', to: null, cc: null, attachments: [], from: null };
    const f = extractFields(parsed, 'sender@example.com', 'hello@tinytrashlabs.com');
    expect(f.fromAddr).toBe('sender@example.com');
  });

  test('missing envelope_to → shared mailbox', () => {
    const parsed = { messageId: '<x>', to: null, cc: null, attachments: [], from: null };
    expect(extractFields(parsed, 'a@b.com', null).mailbox).toBe('shared');
    expect(extractFields(parsed, 'a@b.com', undefined).mailbox).toBe('shared');
  });

  test('case-insensitive personal address resolution', () => {
    const parsed = { messageId: '<x>', to: null, cc: null, attachments: [], from: null };
    expect(extractFields(parsed, '', 'David@tinytrashlabs.com').mailbox).toBe('david');
    expect(extractFields(parsed, '', 'SHANE@tinytrashlabs.com').mailbox).toBe('shane');
  });

  test('attachments default to empty array, not undefined', () => {
    const parsed = { messageId: '<x>', to: null, cc: null, from: null, attachments: undefined };
    const f = extractFields(parsed, '', 'hello@tinytrashlabs.com');
    expect(f.attachmentsMeta).toEqual([]);
  });

  test('null messageId is preserved (dedupe falls back to no-id insert)', () => {
    const parsed = { messageId: null, to: null, cc: null, attachments: [], from: null };
    const f = extractFields(parsed, '', 'hello@tinytrashlabs.com');
    expect(f.messageId).toBeNull();
  });

  test('date falls back to "now" when parsed.date is missing', () => {
    const parsed = { messageId: '<x>', to: null, cc: null, attachments: [], from: null };
    const f = extractFields(parsed, '', 'hello@tinytrashlabs.com');
    expect(f.receivedAt).toBeInstanceOf(Date);
  });
});
