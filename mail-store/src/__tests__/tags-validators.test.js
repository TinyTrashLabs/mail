/**
 * Tests for the pure validators extracted from routes/tags.js. These pin the
 * input shape every tag endpoint relies on — TAG_RE, mailbox query coercion,
 * tag-array normalization, source provenance, and rename-pair validation —
 * without needing a postgres harness.
 */
import {
  TAG_RE,
  normalizeMailboxQuery,
  normalizeTagInput,
  normalizeTagsArray,
  normalizeSource,
  validateRenamePair,
} from '../routes/tags.js';

describe('TAG_RE', () => {
  test('accepts lowercase alnum + hyphen, must start with a letter', () => {
    expect(TAG_RE.test('todo')).toBe(true);
    expect(TAG_RE.test('priority-1')).toBe(true);
    expect(TAG_RE.test('a')).toBe(true);
  });
  test('rejects uppercase, spaces, leading digit, leading hyphen, empty', () => {
    expect(TAG_RE.test('TODO')).toBe(false);
    expect(TAG_RE.test('to do')).toBe(false);
    expect(TAG_RE.test('1priority')).toBe(false);
    expect(TAG_RE.test('-foo')).toBe(false);
    expect(TAG_RE.test('')).toBe(false);
  });
  test('rejects overlong tags (>32 chars total)', () => {
    expect(TAG_RE.test('a'.repeat(32))).toBe(true);
    expect(TAG_RE.test('a'.repeat(33))).toBe(false);
  });
  test('rejects shell/SQL/URL nasties', () => {
    expect(TAG_RE.test("'; DROP TABLE message_tags; --")).toBe(false);
    expect(TAG_RE.test('foo/../bar')).toBe(false);
    expect(TAG_RE.test('foo bar')).toBe(false);
    expect(TAG_RE.test('foo&bar')).toBe(false);
  });
});

describe('normalizeMailboxQuery (array-injection defense)', () => {
  test('returns the string when present', () => {
    expect(normalizeMailboxQuery('david')).toBe('david');
    expect(normalizeMailboxQuery('shared')).toBe('shared');
  });
  test('defaults to shared when missing', () => {
    expect(normalizeMailboxQuery(undefined)).toBe('shared');
    expect(normalizeMailboxQuery(null)).toBe('shared');
    expect(normalizeMailboxQuery('')).toBe('shared');
  });
  test('defaults to shared when an array is supplied (duplicate ?mailbox=)', () => {
    expect(normalizeMailboxQuery(['david', 'shane'])).toBe('shared');
  });
});

describe('normalizeTagInput', () => {
  test('lowercases and trims', () => {
    expect(normalizeTagInput('  TODO  ')).toBe('todo');
    expect(normalizeTagInput('Priority-1')).toBe('priority-1');
  });
  test('returns empty string for non-strings', () => {
    expect(normalizeTagInput(undefined)).toBe('');
    expect(normalizeTagInput(null)).toBe('');
    expect(normalizeTagInput(42)).toBe('');
    expect(normalizeTagInput(['todo'])).toBe('');
  });
});

describe('normalizeTagsArray', () => {
  test('rejects non-arrays', () => {
    expect(normalizeTagsArray(undefined)).toEqual([]);
    expect(normalizeTagsArray('todo')).toEqual([]);
    expect(normalizeTagsArray({})).toEqual([]);
  });
  test('filters invalid tags via TAG_RE', () => {
    expect(normalizeTagsArray(['todo', 'TODO', 'a b', 'priority-1'])).toEqual([
      'todo',
      'todo',
      'priority-1',
    ]);
  });
  test('caps at 20 tags', () => {
    const big = Array.from({ length: 30 }, (_, i) => `tag-${i}`);
    expect(normalizeTagsArray(big)).toHaveLength(20);
  });
  test('coerces non-string entries before filtering', () => {
    expect(normalizeTagsArray([42, 'todo'])).toEqual(['todo']);
  });
});

describe('normalizeSource (provenance never accidentally upgraded)', () => {
  test("only literal 'user' produces 'user'", () => {
    expect(normalizeSource('user')).toBe('user');
  });
  test("anything else falls back to 'ai'", () => {
    expect(normalizeSource('ai')).toBe('ai');
    expect(normalizeSource('admin')).toBe('ai');
    expect(normalizeSource('')).toBe('ai');
    expect(normalizeSource(undefined)).toBe('ai');
    expect(normalizeSource(null)).toBe('ai');
  });
});

describe('validateRenamePair', () => {
  test('rejects invalid from/to', () => {
    expect(validateRenamePair('', 'todo')).toEqual({ ok: false, error: 'invalid from/to' });
    expect(validateRenamePair('todo', '')).toEqual({ ok: false, error: 'invalid from/to' });
    expect(validateRenamePair('TODO', 'todo')).toEqual({ ok: false, error: 'invalid from/to' });
    expect(validateRenamePair('to do', 'todo')).toEqual({ ok: false, error: 'invalid from/to' });
  });
  test('flags from===to as a noop without raising an error', () => {
    expect(validateRenamePair('todo', 'todo')).toEqual({ ok: true, noop: true });
  });
  test('valid distinct pair returns noop:false', () => {
    expect(validateRenamePair('todo', 'done')).toEqual({ ok: true, noop: false });
  });
});
