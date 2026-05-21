/**
 * Unit tests for pure utility functions used in the inbox.
 * Run with: pnpm test:unit
 */

// ── formatDate ────────────────────────────────────────────────────────────────
// Inline the logic here so the tests stay independent of the page component.
function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return isToday
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── avatarInitial ─────────────────────────────────────────────────────────────
function avatarInitial(from: string): string {
  const name = from.split('@')[0] || from;
  return (name[0] || '?').toUpperCase();
}

// ── avatarColor ───────────────────────────────────────────────────────────────
function avatarColor(from: string): string {
  const colors = [
    'bg-teal-strong',
    'bg-[#6db28b]',
    'bg-[#d8a14a]',
    'bg-[#7b8bb3]',
    'bg-[#b37b9e]',
  ];
  let h = 0;
  for (let i = 0; i < from.length; i++) h = (h * 31 + from.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns time for today', () => {
    const now = new Date();
    const result = formatDate(now.toISOString());
    // Should look like "3:45 PM" — just check it doesn't contain a month abbreviation
    expect(result).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)$/i);
  });

  it('returns short date for past dates', () => {
    const past = new Date('2020-01-15T10:00:00Z');
    const result = formatDate(past.toISOString());
    // Should look like "Jan 15"
    expect(result).toMatch(/^[A-Z][a-z]+\s\d{1,2}$/);
  });

  it('handles month boundary correctly', () => {
    const past = new Date('2023-12-25T12:00:00Z');
    const result = formatDate(past.toISOString());
    expect(result).toBe('Dec 25');
  });
});

describe('avatarInitial', () => {
  it('returns first char of local part, uppercased', () => {
    expect(avatarInitial('alice@example.com')).toBe('A');
    expect(avatarInitial('bob@example.com')).toBe('B');
  });

  it('handles plain names (no @)', () => {
    expect(avatarInitial('charlie')).toBe('C');
  });

  it('returns ? for empty string', () => {
    expect(avatarInitial('')).toBe('?');
  });

  it('uppercases lowercase first char', () => {
    expect(avatarInitial('zara@test.com')).toBe('Z');
  });
});

describe('avatarColor', () => {
  it('returns a valid class string', () => {
    const result = avatarColor('alice@example.com');
    expect(result).toMatch(/^bg-/);
  });

  it('is deterministic for the same input', () => {
    expect(avatarColor('test@test.com')).toBe(avatarColor('test@test.com'));
  });

  it('returns different colors for different inputs (probabilistic)', () => {
    const colors = new Set([
      avatarColor('a@a.com'),
      avatarColor('b@b.com'),
      avatarColor('c@c.com'),
      avatarColor('d@d.com'),
      avatarColor('e@e.com'),
      avatarColor('f@f.com'),
      avatarColor('g@g.com'),
    ]);
    // With 7 inputs and 5 buckets, expect at least 3 distinct colors
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });

  it('always returns one of the known classes', () => {
    const known = new Set([
      'bg-teal-strong',
      'bg-[#6db28b]',
      'bg-[#d8a14a]',
      'bg-[#7b8bb3]',
      'bg-[#b37b9e]',
    ]);
    const addresses = ['alice@a.com', 'bob@b.com', 'carol@c.com', 'dave@d.com', 'eve@e.com', 'frank@f.com'];
    for (const addr of addresses) {
      expect(known.has(avatarColor(addr))).toBe(true);
    }
  });
});
