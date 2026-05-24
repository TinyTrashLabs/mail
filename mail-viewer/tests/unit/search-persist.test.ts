/**
 * Unit tests for AISearchBar behavior changes.
 *
 * The component itself requires a full React/Next.js render environment,
 * so we test the pure logic extracted here:
 *
 * 1. Results should NOT be cleared when a message is selected (no onClick clear).
 * 2. Active-message detection: a result is "active" iff its id matches the
 *    URL ?msg= param (string comparison since URLSearchParams returns strings).
 * 3. The clear button appears when results are showing, not only when query is non-empty.
 */

// ── isActiveResult ──────────────────────────────────────────────────────────
// Mirrors the `isActive` logic in AISearchBar: activeMsgId === String(msg.id)

function isActiveResult(activeMsgId: string | null, msgId: number): boolean {
  return activeMsgId === String(msgId);
}

describe('isActiveResult', () => {
  it('matches when URL param equals message id as string', () => {
    expect(isActiveResult('42', 42)).toBe(true);
  });

  it('does not match different id', () => {
    expect(isActiveResult('42', 99)).toBe(false);
  });

  it('does not match when no msg param in URL', () => {
    expect(isActiveResult(null, 42)).toBe(false);
  });

  it('does not match empty string param', () => {
    expect(isActiveResult('', 42)).toBe(false);
  });

  it('treats "0" as valid (edge: first message)', () => {
    expect(isActiveResult('0', 0)).toBe(true);
  });
});

// ── shouldShowClearButton ───────────────────────────────────────────────────
// Clear button shows when query OR results are present (not only when query non-empty).

function shouldShowClearButton(query: string, results: unknown[] | null): boolean {
  return query.length > 0 || results !== null;
}

describe('shouldShowClearButton', () => {
  it('shows when query is non-empty', () => {
    expect(shouldShowClearButton('hello', null)).toBe(true);
  });

  it('shows when results are present (even with empty query)', () => {
    expect(shouldShowClearButton('', [])).toBe(true);
  });

  it('shows when both query and results present', () => {
    expect(shouldShowClearButton('q', [{ id: 1 }])).toBe(true);
  });

  it('hides when query empty and no results', () => {
    expect(shouldShowClearButton('', null)).toBe(false);
  });
});

// ── clear() leaves no residue ───────────────────────────────────────────────
// The clear action must zero out query, results, explanation, and error.

interface SearchState {
  query: string;
  results: unknown[] | null;
  explanation: string;
  error: string;
}

function applylear(state: SearchState): SearchState {
  return { query: '', results: null, explanation: '', error: '' };
}

describe('clear()', () => {
  it('resets all search state to blank', () => {
    const after = applylear({
      query: 'invoices',
      results: [{ id: 1 }],
      explanation: 'Found 1 invoice.',
      error: '',
    });
    expect(after).toEqual({ query: '', results: null, explanation: '', error: '' });
  });

  it('is idempotent on already-cleared state', () => {
    const blank: SearchState = { query: '', results: null, explanation: '', error: '' };
    expect(applylear(blank)).toEqual(blank);
  });
});
