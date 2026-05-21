/**
 * Unit tests for Gmail-parity pure utility logic.
 * These mirror the functions embedded in InboxClient without importing the
 * React component (which would require a full Next.js/jsdom setup).
 */

// ── normalizeSubject ────────────────────────────────────────────────────────

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd?|fw):\s*/gi, '')
    .trim()
    .toLowerCase();
}

describe('normalizeSubject', () => {
  it('lowercases plain subjects', () => {
    expect(normalizeSubject('Hello World')).toBe('hello world');
  });

  it('strips Re: prefix', () => {
    expect(normalizeSubject('Re: Hello World')).toBe('hello world');
  });

  it('strips re: case-insensitively', () => {
    expect(normalizeSubject('RE: Hello World')).toBe('hello world');
  });

  it('strips Fwd: prefix', () => {
    expect(normalizeSubject('Fwd: Hello World')).toBe('hello world');
  });

  it('strips Fw: prefix', () => {
    expect(normalizeSubject('Fw: Hello World')).toBe('hello world');
  });

  it('strips FWD: prefix', () => {
    expect(normalizeSubject('FWD: Hello World')).toBe('hello world');
  });

  it('handles multiple spaces after prefix', () => {
    expect(normalizeSubject('Re:   Spaced')).toBe('spaced');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeSubject('')).toBe('');
  });

  it('does not strip mid-string re:', () => {
    expect(normalizeSubject('Meeting re: budget')).toBe('meeting re: budget');
  });
});

// ── thread grouping logic ───────────────────────────────────────────────────

interface MockMsg {
  id: number;
  subject: string;
  from_addr: string;
}

/** Mirror of threadKey in InboxClient — subject + sender domain */
function threadKey(msg: MockMsg): string {
  const domain = msg.from_addr.split('@')[1]?.toLowerCase() ?? msg.from_addr.toLowerCase();
  return `${normalizeSubject(msg.subject)}|${domain}`;
}

function groupThreads(messages: MockMsg[]) {
  const threadMap = new Map<string, number>();
  for (const msg of messages) {
    const key = threadKey(msg);
    threadMap.set(key, (threadMap.get(key) ?? 0) + 1);
  }
  const seenThreads = new Set<string>();
  return messages.map((msg) => {
    const key = threadKey(msg);
    const threadCount = threadMap.get(key) ?? 1;
    const isThreadHead = !seenThreads.has(key);
    if (isThreadHead) seenThreads.add(key);
    return { msg, threadCount, isThreadHead };
  });
}

describe('thread grouping', () => {
  it('marks single messages as thread head with count 1', () => {
    const msgs: MockMsg[] = [{ id: 1, subject: 'Hello', from_addr: 'a@b.com' }];
    const result = groupThreads(msgs);
    expect(result[0].threadCount).toBe(1);
    expect(result[0].isThreadHead).toBe(true);
  });

  it('groups Re: replies within the same sender domain', () => {
    const msgs: MockMsg[] = [
      { id: 1, subject: 'Hello', from_addr: 'alice@corp.com' },
      { id: 2, subject: 'Re: Hello', from_addr: 'bob@corp.com' },
      { id: 3, subject: 'Re: Hello', from_addr: 'carol@corp.com' },
    ];
    const result = groupThreads(msgs);
    expect(result[0].threadCount).toBe(3);
    expect(result[0].isThreadHead).toBe(true);
    expect(result[1].threadCount).toBe(3);
    expect(result[1].isThreadHead).toBe(false);
    expect(result[2].isThreadHead).toBe(false);
  });

  it('does NOT group same subject from different domains', () => {
    // "Hello" from acme.com and "Re: Hello" from other.com are different threads
    const msgs: MockMsg[] = [
      { id: 1, subject: 'Hello', from_addr: 'x@acme.com' },
      { id: 2, subject: 'Re: Hello', from_addr: 'y@other.com' },
    ];
    const result = groupThreads(msgs);
    expect(result[0].threadCount).toBe(1);
    expect(result[1].threadCount).toBe(1);
    expect(result[0].isThreadHead).toBe(true);
    expect(result[1].isThreadHead).toBe(true);
  });

  it('treats distinct subjects as separate threads', () => {
    const msgs: MockMsg[] = [
      { id: 1, subject: 'Hello', from_addr: 'a@b.com' },
      { id: 2, subject: 'World', from_addr: 'a@b.com' },
    ];
    const result = groupThreads(msgs);
    expect(result[0].threadCount).toBe(1);
    expect(result[1].threadCount).toBe(1);
    expect(result[0].isThreadHead).toBe(true);
    expect(result[1].isThreadHead).toBe(true);
  });

  it('handles empty message list', () => {
    expect(groupThreads([])).toEqual([]);
  });
});

// ── view mode filtering ─────────────────────────────────────────────────────

interface MsgState { is_read: boolean; is_starred: boolean; }

function filterByViewMode(
  messages: MockMsg[],
  states: Record<string, MsgState>,
  viewMode: 'all' | 'unread' | 'starred',
  searchQuery = ''
): MockMsg[] {
  const getState = (id: number): MsgState =>
    states[String(id)] ?? { is_read: false, is_starred: false };

  return messages.filter((msg) => {
    if (viewMode === 'unread' && getState(msg.id).is_read) return false;
    if (viewMode === 'starred' && !getState(msg.id).is_starred) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return msg.subject.toLowerCase().includes(q) || msg.from_addr.toLowerCase().includes(q);
    }
    return true;
  });
}

describe('filterByViewMode', () => {
  const msgs: MockMsg[] = [
    { id: 1, subject: 'Invoice', from_addr: 'billing@acme.com' },
    { id: 2, subject: 'Meeting notes', from_addr: 'boss@corp.com' },
    { id: 3, subject: 'Fwd: Invoice', from_addr: 'alice@corp.com' },
  ];
  const states: Record<string, MsgState> = {
    '1': { is_read: true, is_starred: true },
    '2': { is_read: false, is_starred: false },
    // 3 has no state entry — defaults to unread, unstarred
  };

  it('all mode returns everything', () => {
    expect(filterByViewMode(msgs, states, 'all')).toHaveLength(3);
  });

  it('unread mode hides read messages', () => {
    const result = filterByViewMode(msgs, states, 'unread');
    expect(result.map(m => m.id)).toEqual([2, 3]);
  });

  it('starred mode shows only starred', () => {
    const result = filterByViewMode(msgs, states, 'starred');
    expect(result.map(m => m.id)).toEqual([1]);
  });

  it('search filters by subject case-insensitively', () => {
    const result = filterByViewMode(msgs, states, 'all', 'invoice');
    expect(result.map(m => m.id)).toEqual([1, 3]);
  });

  it('search filters by from_addr', () => {
    const result = filterByViewMode(msgs, states, 'all', 'acme');
    expect(result.map(m => m.id)).toEqual([1]);
  });

  it('search combined with unread mode', () => {
    const result = filterByViewMode(msgs, states, 'unread', 'invoice');
    // msg 1 is read (excluded by unread mode), msg 3 matches invoice and is unread
    expect(result.map(m => m.id)).toEqual([3]);
  });

  it('empty search returns all in mode', () => {
    expect(filterByViewMode(msgs, states, 'all', '')).toHaveLength(3);
  });
});
