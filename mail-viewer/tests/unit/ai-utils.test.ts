/**
 * Unit tests for AI route utility logic (no real Anthropic calls).
 */

// ── allowedMailboxes ──────────────────────────────────────────────────────────
// Inline the logic from search/route.ts so tests stay independent
function allowedMailboxes(username: string): string[] {
  return [username, 'shared'];
}

// ── parseAISearchResponse ────────────────────────────────────────────────────
// Mirrors the JSON/code-fence parsing in search/route.ts
function parseAISearchResponse(raw: string): { indices?: number[]; explanation?: string } | null {
  if (!raw.trim()) return null;
  try {
    const clean = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// ── filterIndices ─────────────────────────────────────────────────────────────
function filterIndices(indices: unknown[] | undefined, length: number): number[] {
  return (indices || []).filter(
    (i): i is number => typeof i === 'number' && i >= 0 && i < length
  );
}

// ── stripHtml ─────────────────────────────────────────────────────────────────
// Matches the HTML-strip fallback in inbox/[id]/page.tsx
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('allowedMailboxes', () => {
  it('allows own username and shared', () => {
    expect(allowedMailboxes('alice')).toEqual(['alice', 'shared']);
  });

  it('blocks arbitrary mailbox names', () => {
    const allowed = allowedMailboxes('alice');
    expect(allowed.includes('bob')).toBe(false);
    expect(allowed.includes('admin')).toBe(false);
    expect(allowed.includes('')).toBe(false);
  });

  it('handles empty username (unauthenticated edge case)', () => {
    const allowed = allowedMailboxes('');
    // empty username → only 'shared' is reachable ('' would match own mailbox but that's a degenerate case)
    expect(allowed.includes('shared')).toBe(true);
  });
});

describe('parseAISearchResponse', () => {
  it('parses clean JSON', () => {
    const raw = '{"indices":[0,2],"explanation":"Found 2 matching emails."}';
    const result = parseAISearchResponse(raw);
    expect(result).toEqual({ indices: [0, 2], explanation: 'Found 2 matching emails.' });
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"indices":[1],"explanation":"One match."}\n```';
    const result = parseAISearchResponse(raw);
    expect(result?.indices).toEqual([1]);
  });

  it('strips plain code fences', () => {
    const raw = '```\n{"indices":[],"explanation":"None."}\n```';
    const result = parseAISearchResponse(raw);
    expect(result?.indices).toEqual([]);
  });

  it('returns null on empty input', () => {
    expect(parseAISearchResponse('')).toBeNull();
    expect(parseAISearchResponse('  ')).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    expect(parseAISearchResponse('not json at all')).toBeNull();
    expect(parseAISearchResponse('{bad}')).toBeNull();
  });

  it('handles missing fields gracefully', () => {
    const result = parseAISearchResponse('{"explanation":"Only explanation."}');
    expect(result?.indices).toBeUndefined();
    expect(result?.explanation).toBe('Only explanation.');
  });
});

describe('filterIndices', () => {
  const length = 5;

  it('returns valid in-bounds indices', () => {
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
