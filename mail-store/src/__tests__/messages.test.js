/**
 * Tests for the real access-control and id-parsing functions used by
 * routes/messages.js. We import the actual exported helpers — no inline
 * reimplementation, so a regression in the production code WILL fail here.
 */

import crypto from 'node:crypto';
import { canAccessMailbox, canReadMessage, parseMessageId } from '../access.js';
import { mintViewerToken, verifyViewerToken } from '../viewer-token.js';

describe('canAccessMailbox (list endpoint)', () => {
  test('shared mailbox is open to anyone', () => {
    expect(canAccessMailbox('shared', 'david')).toBe(true);
    expect(canAccessMailbox('shared', '')).toBe(true);
  });

  test('owner reads own personal mailbox', () => {
    expect(canAccessMailbox('david', 'david')).toBe(true);
    expect(canAccessMailbox('shane', 'shane')).toBe(true);
  });

  test('IDOR: cross-user reads blocked', () => {
    expect(canAccessMailbox('david', 'shane')).toBe(false);
    expect(canAccessMailbox('shane', 'david')).toBe(false);
  });

  test('anonymous viewer blocked from personal mailbox', () => {
    expect(canAccessMailbox('david', '')).toBe(false);
  });

  test('arbitrary mailbox names blocked', () => {
    expect(canAccessMailbox('attacker', 'attacker')).toBe(false);
    expect(canAccessMailbox('', 'david')).toBe(false);
  });
});

describe('canReadMessage (detail endpoint)', () => {
  test('shared message readable by anyone', () => {
    expect(canReadMessage('shared', 'david')).toBe(true);
    expect(canReadMessage('shared', '')).toBe(true);
  });

  test('personal message readable by owner only', () => {
    expect(canReadMessage('david', 'david')).toBe(true);
    expect(canReadMessage('david', 'shane')).toBe(false);
    expect(canReadMessage('david', '')).toBe(false);
  });
});

describe('parseMessageId', () => {
  test('valid positive integers parse', () => {
    expect(parseMessageId('1')).toBe(1);
    expect(parseMessageId('42')).toBe(42);
    expect(parseMessageId('999999999')).toBe(999999999);
  });

  test('non-numeric input returns null', () => {
    expect(parseMessageId('abc')).toBeNull();
    expect(parseMessageId('1; DROP TABLE messages')).toBeNull();
    expect(parseMessageId('1.5')).toBeNull();
    expect(parseMessageId('-1')).toBeNull();
  });

  test('zero, negatives, and leading zeros rejected', () => {
    expect(parseMessageId('0')).toBeNull();
    expect(parseMessageId('01')).toBeNull();
    expect(parseMessageId('-5')).toBeNull();
  });

  test('empty and nullish input returns null', () => {
    expect(parseMessageId('')).toBeNull();
    expect(parseMessageId(null)).toBeNull();
    expect(parseMessageId(undefined)).toBeNull();
  });

  test('safe-integer bound respected', () => {
    expect(parseMessageId('9007199254740993')).toBeNull(); // > MAX_SAFE_INTEGER
  });
});

describe('viewer token (mint + verify roundtrip)', () => {
  const oldSecret = process.env.VIEWER_SECRET;
  beforeAll(() => { process.env.VIEWER_SECRET = 'test-secret-for-jest-only'; });
  afterAll(() => { process.env.VIEWER_SECRET = oldSecret; });

  test('mint then verify returns the same user', () => {
    const tok = mintViewerToken('david');
    expect(verifyViewerToken(tok)).toBe('david');
  });

  test('empty user is preserved (anonymous shared-only)', () => {
    const tok = mintViewerToken('');
    expect(verifyViewerToken(tok)).toBe('');
  });

  test('tampered payload fails verification', () => {
    const tok = mintViewerToken('david');
    // Swap the payload but keep the original signature
    const evilPayload = Buffer.from(JSON.stringify({ user: 'shane', exp: 9999999999 }))
      .toString('base64url');
    const sig = tok.split('.')[1];
    expect(verifyViewerToken(`${evilPayload}.${sig}`)).toBeNull();
  });

  test('wrong secret fails verification', () => {
    const tok = mintViewerToken('david');
    process.env.VIEWER_SECRET = 'a-different-secret';
    expect(verifyViewerToken(tok)).toBeNull();
    process.env.VIEWER_SECRET = 'test-secret-for-jest-only';
  });

  test('expired token fails verification', () => {
    // Mint a token by hand with exp in the past
    const payload = Buffer.from(JSON.stringify({ user: 'david', exp: 1 }))
      .toString('base64url');
    // Sign correctly with current secret
    const sig = crypto.createHmac('sha256', process.env.VIEWER_SECRET)
      .update(payload).digest().toString('base64url');
    expect(verifyViewerToken(`${payload}.${sig}`)).toBeNull();
  });

  test('malformed token returns null, never throws', () => {
    expect(verifyViewerToken('garbage')).toBeNull();
    expect(verifyViewerToken('')).toBeNull();
    expect(verifyViewerToken(null)).toBeNull();
    expect(verifyViewerToken('no.dot.here.extra')).toBeNull();
  });
});
