'use client';

/**
 * InboxClient — interactive inbox list with:
 *  - Read/unread state (bold unread, dim read)
 *  - Star toggle
 *  - Native text search/filter (client-side, current page)
 *  - Keyboard shortcuts: j/k navigate, Enter open, r reply, s star, / search focus, ? help
 *  - Thread grouping by normalized subject
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Paperclip, Star, Search, X, HelpCircle } from 'lucide-react';

interface Message {
  id: number;
  subject: string;
  from_addr: string;
  received_at: string;
  attachments_meta?: { filename: string; contentType: string; size: number }[];
}

interface MessageState {
  is_read: boolean;
  is_starred: boolean;
}

interface InboxClientProps {
  messages: Message[];
  initialStates: Record<string, MessageState>;
  mailbox: string;
  total: number;
  page: number;
  totalPages: number;
}

function formatDate(iso: string) {
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

function avatarInitial(from: string) {
  const name = from.split('@')[0] || from;
  return (name[0] || '?').toUpperCase();
}

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

/** Normalize subject for thread grouping: strip Re:/Fwd: prefixes, lowercase */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd?|fw):\s*/gi, '')
    .trim()
    .toLowerCase();
}

/**
 * Thread key: normalized subject + sender domain.
 * Using sender domain (not full address) groups replies from multiple
 * addresses at the same domain while preventing false grouping of
 * unrelated messages that happen to share a common subject like "Hello".
 */
function threadKey(msg: { subject: string; from_addr: string }): string {
  const domain = msg.from_addr.split('@')[1]?.toLowerCase() ?? msg.from_addr.toLowerCase();
  return `${normalizeSubject(msg.subject)}|${domain}`;
}

type ViewMode = 'all' | 'unread' | 'starred';

export function InboxClient({
  messages,
  initialStates,
  mailbox,
  total,
  page,
  totalPages,
}: InboxClientProps) {
  const [states, setStates] = useState<Record<string, MessageState>>(initialStates);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [showHelp, setShowHelp] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const getState = useCallback(
    (id: number): MessageState =>
      states[String(id)] ?? { is_read: false, is_starred: false },
    [states]
  );

  // Filter messages
  const filtered = messages.filter((msg) => {
    if (viewMode === 'unread' && getState(msg.id).is_read) return false;
    if (viewMode === 'starred' && !getState(msg.id).is_starred) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        msg.subject.toLowerCase().includes(q) ||
        msg.from_addr.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Thread grouping: group by normalized subject + sender domain to avoid
  // falsely threading unrelated messages that share a common subject.
  const threaded: { msg: Message; threadCount: number; isThreadHead: boolean }[] = [];
  const threadMap = new Map<string, number>(); // thread key → count
  for (const msg of filtered) {
    const key = threadKey(msg);
    threadMap.set(key, (threadMap.get(key) ?? 0) + 1);
  }
  // Second pass — mark first occurrence of each thread key as head
  const seenThreads = new Set<string>();
  for (const msg of filtered) {
    const key = threadKey(msg);
    const count = threadMap.get(key) ?? 1;
    const isHead = !seenThreads.has(key);
    if (isHead) seenThreads.add(key);
    threaded.push({ msg, threadCount: count, isThreadHead: isHead });
  }

  const patchState = useCallback(
    async (id: number, patch: Partial<MessageState>) => {
      // Optimistic update
      setStates((prev) => ({
        ...prev,
        [String(id)]: { ...(prev[String(id)] ?? { is_read: false, is_starred: false }), ...patch },
      }));
      try {
        await fetch(`/api/messages/${id}/state`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } catch {
        // Revert on network error (best-effort)
        setStates((prev) => {
          const next = { ...prev };
          delete next[String(id)];
          return { ...next, [String(id)]: initialStates[String(id)] ?? { is_read: false, is_starred: false } };
        });
      }
    },
    [initialStates]
  );

  const toggleStar = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.preventDefault();
      e.stopPropagation();
      patchState(id, { is_starred: !getState(id).is_starred });
    },
    [getState, patchState]
  );

  const markRead = useCallback(
    (id: number) => {
      if (!getState(id).is_read) {
        patchState(id, { is_read: true });
      }
    },
    [getState, patchState]
  );

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') {
          setSearchQuery('');
          (e.target as HTMLInputElement).blur();
        }
        return;
      }

      switch (e.key) {
        case 'j':
          setFocusedIdx((i) => Math.min(i + 1, threaded.length - 1));
          break;
        case 'k':
          setFocusedIdx((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          if (focusedIdx >= 0 && threaded[focusedIdx]) {
            rowRefs.current[focusedIdx]?.click();
          }
          break;
        case 's':
          if (focusedIdx >= 0 && threaded[focusedIdx]) {
            const { msg } = threaded[focusedIdx];
            patchState(msg.id, { is_starred: !getState(msg.id).is_starred });
          }
          break;
        case '/':
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case '?':
          setShowHelp((v) => !v);
          break;
        case 'Escape':
          setShowHelp(false);
          setFocusedIdx(-1);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedIdx, threaded, getState, patchState]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIdx >= 0) {
      rowRefs.current[focusedIdx]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIdx]);

  const unreadCount = messages.filter((m) => !getState(m.id).is_read).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 pt-3 pb-2 border-b border-rule bg-cream flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-sans font-semibold text-ink capitalize">{mailbox}</h1>
            {unreadCount > 0 && (
              <span className="text-xs bg-teal text-cream rounded-full px-2 py-0.5 font-sans font-medium">
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View mode tabs */}
            {(['all', 'unread', 'starred'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`text-xs px-2.5 py-1 rounded-card font-sans transition-colors capitalize ${
                  viewMode === mode
                    ? 'bg-teal text-cream font-medium'
                    : 'text-ink-soft hover:text-ink hover:bg-rule'
                }`}
              >
                {mode}
              </button>
            ))}
            <button
              onClick={() => setShowHelp((v) => !v)}
              className="text-ink-soft hover:text-ink transition-colors ml-1"
              title="Keyboard shortcuts (?)"
            >
              <HelpCircle size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search size={13} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Filter messages… ( / )"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm font-sans bg-[#f0ede4] border border-rule rounded-card text-ink placeholder:text-ink-soft focus:outline-none focus:border-teal transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
            >
              <X size={13} strokeWidth={2} />
            </button>
          )}
        </div>

        {searchQuery && (
          <p className="text-xs text-ink-soft font-sans">
            {filtered.length} of {total} messages
          </p>
        )}
      </div>

      {/* Help modal */}
      {showHelp && (
        <div
          className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-cream rounded-card shadow-xl p-6 max-w-sm w-full mx-4 border border-rule"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif font-semibold text-ink">Keyboard shortcuts</h2>
              <button onClick={() => setShowHelp(false)} className="text-ink-soft hover:text-ink">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <dl className="grid grid-cols-[3rem_1fr] gap-x-4 gap-y-2 text-sm font-sans">
              {[
                ['j / k', 'Navigate up / down'],
                ['Enter', 'Open selected message'],
                ['s', 'Toggle star on selected'],
                ['/', 'Focus search bar'],
                ['Esc', 'Clear focus / close'],
                ['?', 'Toggle this help'],
              ].map(([key, desc]) => (
                <Fragment key={key}>
                  <dt className="font-mono text-teal-strong font-medium">{key}</dt>
                  <dd className="text-ink-soft">{desc}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto divide-y divide-rule">
        {filtered.length === 0 && (
          <div className="p-12 text-ink-soft text-center text-sm font-sans">
            {searchQuery ? 'No messages match that filter.' : 'No messages.'}
          </div>
        )}

        {threaded.map(({ msg, threadCount, isThreadHead }, idx) => {
          const state = getState(msg.id);
          const isFocused = focusedIdx === idx;

          return (
            <Link
              key={msg.id}
              href={`/inbox/${msg.id}?mailbox=${mailbox}`}
              ref={(el) => { rowRefs.current[idx] = el; }}
              onClick={() => markRead(msg.id)}
              className={`flex items-center gap-3 px-6 py-3 transition-colors group ${
                isFocused ? 'bg-teal/10' : 'hover:bg-[#f0ede4]'
              }`}
            >
              {/* Unread indicator dot */}
              <div className="flex-shrink-0 w-2 h-2 flex items-center justify-center">
                {!state.is_read && (
                  <div className="w-2 h-2 rounded-full bg-teal-strong" />
                )}
              </div>

              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full ${avatarColor(msg.from_addr)} flex items-center justify-center text-xs font-bold text-cream flex-shrink-0`}
              >
                {avatarInitial(msg.from_addr)}
              </div>

              {/* Star button */}
              <button
                onClick={(e) => toggleStar(e, msg.id)}
                className="flex-shrink-0 focus:outline-none"
                title={state.is_starred ? 'Unstar' : 'Star'}
              >
                <Star
                  size={13}
                  strokeWidth={1.5}
                  className={`transition-colors ${
                    state.is_starred
                      ? 'fill-[#d8a14a] text-[#d8a14a]'
                      : 'text-rule group-hover:text-ink-soft'
                  }`}
                />
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0 grid grid-cols-[10rem_1fr_auto] items-baseline gap-2">
                <span className={`text-sm truncate ${state.is_read ? 'text-ink-soft font-normal' : 'text-ink font-semibold'}`}>
                  {msg.from_addr.split('@')[0]}
                </span>
                <span className={`text-sm font-sans truncate ${state.is_read ? 'text-ink-soft' : 'text-ink'}`}>
                  {msg.subject}
                  {threadCount > 1 && isThreadHead && (
                    <span className="ml-1.5 text-xs text-ink-soft font-sans">({threadCount})</span>
                  )}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {(msg.attachments_meta?.length ?? 0) > 0 && (
                    <Paperclip size={12} className="text-ink-soft" strokeWidth={1.75} />
                  )}
                  <span className={`text-xs font-sans whitespace-nowrap ${state.is_read ? 'text-ink-soft' : 'text-ink-soft font-medium'}`}>
                    {formatDate(msg.received_at)}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 px-6 py-3 border-t border-rule text-sm font-sans flex-shrink-0">
          {page > 1 && (
            <Link href={`/inbox?mailbox=${mailbox}&page=${page - 1}`} className="text-teal-strong hover:underline">
              ← Prev
            </Link>
          )}
          <span className="text-ink-soft">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={`/inbox?mailbox=${mailbox}&page=${page + 1}`} className="text-teal-strong hover:underline">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
