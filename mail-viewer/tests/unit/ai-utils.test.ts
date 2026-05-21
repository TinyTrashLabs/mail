/**
 * Unit tests for AI utility functions.
 * Imports from the REAL src/lib/ai-utils.ts — tests exercise actual route logic.
 */
import {
  allowedMailboxes,
  parseAISearchResponse,
  filterIndices,
  stripHtml,
} from '../../src/lib/ai-utils';

describe('allowedMailboxes', () => {
  it('allows own username and shared', () => {
    expect(allowedMailboxes('alice')).toEqual(['alice', 'shared']);
  });

  it('blocks arbitrary mailbox names', () => {
    const allowed = allowedMailboxes('alice');
    expect(allowed.includes('bob')).toBe(false);
    expect(allowed.includes('admin')).toBe(false);
  });

  it('always includes shared', () => {
    expect(allowedMailboxes('anyone').includes('shared')).toBe(true);
  });
});

describe('parseAISearchResponse', () => {
  it('parses clean JSON', () => {
    const result = parseAISearchResponse('{"indices":[0,2],"explanation":"Two matches."}');
    expect(result).toEqual({ indices: [0, 2], explanation: 'Two matches.' });
  });

  it('strips json code fences', () => {
    const result = parseAISearchResponse('```json\n{"indices":[1],"explanation":"One."}\n```');
    expect(result?.indices).toEqual([1]);
  });

  it('strips plain code fences', () => {
    const result = parseAISearchResponse('```\n{"indices":[],"explanation":"None."}\n```');
    expect(result?.indices).toEqual([]);
  });

  it('returns null on empty string', () => {
    expect(parseAISearchResponse('')).toBeNull();
    expect(parseAISearchResponse('   ')).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    expect(parseAISearchResponse('not json')).toBeNull();
    expect(parseAISearchResponse('{bad}')).toBeNull();
  });

  it('handles partial response (no indices)', () => {
    const result = parseAISearchResponse('{"explanation":"Only explanation."}');
    expect(result?.indices).toBeUndefined();
    expect(result?.explanation).toBe('Only explanation.');
  });
});

describe('filterIndices', () => {
  const length = 5;

  it('keeps valid in-bounds indices', () => {
    expect(filterIndices([0, 2, 4], length)).toEqual([0, 2, 4]);
  });

  it('drops out-of-bounds indices', () => {
    expect(filterIndices([0, 5, 10], length)).toEqual([0]);
  });

  it('drops negative indices', () => {
    expect(filterIndices([-1, 0, 1], length)).toEqual([0, 1]);
  });

  it('drops non-number values', () => {
    expect(filterIndices([0, 'two', null, 3], length)).toEqual([0, 3]);
  });

  it('handles undefined gracefully', () => {
    expect(filterIndices(undefined, length)).toEqual([]);
  });

  it('handles zero-length array', () => {
    expect(filterIndices([0, 1], 0)).toEqual([]);
  });
});

describe('stripHtml', () => {
  it('removes simple tags', () => {
    expect(stripHtml('<p>Hello world</p>')).toBe('Hello world');
  });

  it('collapses multiple spaces', () => {
    expect(stripHtml('<p>Hello</p>   <p>world</p>')).toBe('Hello world');
  });

  it('handles self-closing tags', () => {
    expect(stripHtml('Line1<br/>Line2')).toBe('Line1 Line2');
  });

  it('returns empty string for tag-only input', () => {
    expect(stripHtml('<html><body></body></html>')).toBe('');
  });

  it('preserves plain text unchanged', () => {
    expect(stripHtml('no tags here')).toBe('no tags here');
  });
});
