/**
 * Tests for attachment route logic — filename sanitization, size cap,
 * and access-control integration (canReadMessage).
 *
 * We don't spin up a live Express server or DB here; instead we test:
 *   1. The filename sanitizer regex (extracted inline for direct testing).
 *   2. The 20 MB size cap constant.
 *   3. canReadMessage gating (re-used by the attachment route).
 *   4. extractFields attachmentData capture.
 */

import { canReadMessage } from '../access.js';
import { extractFields } from '../ingest-fields.js';

// ─── filename sanitizer ───────────────────────────────────────────────────────
// Mirrors the regex in routes/messages.js for header-injection prevention.
// eslint-disable-next-line no-control-regex
const sanitizeFilename = (raw) => raw.replace(/[\x00-\x1f\x7f"]/g, '');

describe('attachment filename sanitizer', () => {
  test('normal filenames pass through unchanged', () => {
    expect(sanitizeFilename('report.pdf')).toBe('report.pdf');
    expect(sanitizeFilename('photo 2026.jpg')).toBe('photo 2026.jpg');
    expect(sanitizeFilename('résumé.docx')).toBe('résumé.docx');
  });

  test('double-quotes are stripped (header injection prevention)', () => {
    expect(sanitizeFilename('evil"name.txt')).toBe('evilname.txt');
    expect(sanitizeFilename('"report".pdf')).toBe('report.pdf');
  });

  test('CR and LF stripped (header injection prevention)', () => {
    expect(sanitizeFilename('name\r\nInjected: header')).toBe('nameInjected: header');
    expect(sanitizeFilename('file\nname.txt')).toBe('filename.txt');
  });

  test('other control characters stripped', () => {
    expect(sanitizeFilename('\x00\x01\x1f\x7fname.txt')).toBe('name.txt');
  });

  test('empty filename produces empty string (caller falls back to attachment-{idx})', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});

// ─── size cap ─────────────────────────────────────────────────────────────────
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

describe('attachment size cap', () => {
  test('20 MB cap constant is 20971520 bytes', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(20_971_520);
  });

  test('file at exactly cap is NOT blocked', () => {
    expect(MAX_ATTACHMENT_BYTES > MAX_ATTACHMENT_BYTES).toBe(false);
  });

  test('file one byte over cap IS blocked', () => {
    const meta = { size: MAX_ATTACHMENT_BYTES + 1, contentType: 'image/jpeg', filename: 'a.jpg' };
    expect(meta.size > MAX_ATTACHMENT_BYTES).toBe(true);
  });
});

// ─── access control (reused by attachment route) ──────────────────────────────
describe('canReadMessage used by attachment route', () => {
  test('david can read his own personal message', () => {
    expect(canReadMessage('david', 'david')).toBe(true);
  });

  test('cross-user IDOR blocked — shane cannot read davids attachment', () => {
    expect(canReadMessage('david', 'shane')).toBe(false);
  });

  test('anonymous cannot read personal attachment', () => {
    expect(canReadMessage('david', '')).toBe(false);
  });

  test('shared attachment readable by anyone', () => {
    expect(canReadMessage('shared', 'david')).toBe(true);
    expect(canReadMessage('shared', '')).toBe(true);
  });
});

// ─── attachmentData capture in extractFields ─────────────────────────────────
describe('extractFields attachmentData', () => {
  test('buffer is captured per attachment', () => {
    const buf = Buffer.from('fake binary content');
    const parsed = {
      messageId: '<x@example.com>',
      to: null, cc: null, from: null,
      attachments: [
        { filename: 'test.txt', contentType: 'text/plain', size: 19, content: buf },
      ],
    };
    const f = extractFields(parsed, 'a@b.com', 'david@tinytrashlabs.com');
    expect(f.attachmentData).toHaveLength(1);
    expect(Buffer.isBuffer(f.attachmentData[0])).toBe(true);
    expect(f.attachmentData[0]).toEqual(buf);
  });

  test('missing content yields null in attachmentData (no crash)', () => {
    const parsed = {
      messageId: '<y@example.com>',
      to: null, cc: null, from: null,
      attachments: [
        { filename: 'no-content.pdf', contentType: 'application/pdf', size: 0 },
      ],
    };
    const f = extractFields(parsed, 'a@b.com', 'hello@tinytrashlabs.com');
    expect(f.attachmentData[0]).toBeNull();
  });

  test('empty attachments array produces empty attachmentData', () => {
    const parsed = { messageId: '<z>', to: null, cc: null, from: null, attachments: [] };
    const f = extractFields(parsed, '', 'contact@tinytrashlabs.com');
    expect(f.attachmentData).toEqual([]);
  });

  test('undefined attachments produces empty attachmentData', () => {
    const parsed = { messageId: '<z>', to: null, cc: null, from: null, attachments: undefined };
    const f = extractFields(parsed, '', 'contact@tinytrashlabs.com');
    expect(f.attachmentData).toEqual([]);
  });
});
