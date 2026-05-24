'use client';

/**
 * InboxClient — Gmail-style two-pane layout.
 * Left: message list. Right: reading pane (loaded via ?msg=<id> URL state).
 * On mobile (< sm breakpoint), shows only one pane at a time.
 * Keyboard: j/k navigate, Enter open in pane, o open full page, s star,
 *           r reply, / search, ? help, Escape close pane.
 */

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Paperclip, Star, Search, X, HelpCircle, Reply, Forward,
  Tag, ArrowLeft, ExternalLink, ChevronDown, ChevronUp, Code2,
} from 'lucide-react';
import { AISummary } from '@/components/AISummary';
import { MessageActions } from '@/components/MessageActions';
import { formatFromAddr, formatDisplayName } from '@/lib/display-name';
import { openComposeDrawer } from '@/components/ComposeDrawer';

interface Message {
  id: number;
  subject: string;
  from_addr: string;
  received_at: string;
  attachments_meta?: { filename: string; contentType: string; size: number }[];
  tags?: string[];
}

interface FullMessage extends Message {
  message_id: string | null;
  in_reply_to: string | null;
  to_addrs: { name: string; address: string }[];
  cc_addrs: { name: string; address: string }[];
  text_body: string | null;
  html_body: string | null;
  mailbox: string;
}

interface MessageState {
  is_read: boolean;
  is_starred: boolean;
  is_trashed: boolean;
}

interface InboxClientProps {
  messages: Message[];
  initialStates: Record<string, MessageState>;
  mailbox: string;
  total: number;
  page: number;
  totalPages: number;
  tag?: string;
  selectedMsgId: number | null;
  selectedMsg: FullMessage | null;
  selectedSafeHtml: string | null;
  bodyForAI: string;
  username: string;
  initialViewMode?: ViewMode;
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
  // Use display name initial if parseable, else email local-part
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const name = m ? (m[1].trim() || m[2].split('@')[0]) : from.split('@')[0];
  return (name[0] || '?').toUpperCase();
}

function avatarColor(from: string): string {
  const colors = ['bg-teal-strong', 'bg-[#6db28b]', 'bg-[#d8a14a]', 'bg-[#7b8bb3]', 'bg-[#b37b9e]'];
  let h = 0;
  for (let i = 0; i < from.length; i++) h = (h * 31 + from.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function normalizeSubject(s: string) {
  return s.replace(/^(re|fwd?|fw):\s*/gi, '').trim().toLowerCase();
}
function threadKey(msg: { subject: string; from_addr: string }) {
  const domain = msg.from_addr.split('@')[1]?.toLowerCase() ?? msg.from_addr.toLowerCase();
  return `${normalizeSubject(msg.subject)}|${domain}`;
}

type ViewMode = 'all' | 'unread' | 'starred';

const TAG_COLORS: Record<string, string> = {
  important: 'bg-[#d8a14a]/20 text-[#a07030]',
  newsletter: 'bg-[#7b8bb3]/20 text-[#4a5a8a]',
  notification: 'bg-[#6db28b]/20 text-[#3a7a5a]',
  receipt: 'bg-[#b37b9e]/20 text-[#7a4a6a]',
  action: 'bg-teal/20 text-teal-strong',
};
function tagColor(tag: string) {
  return TAG_COLORS[tag] || 'bg-rule text-ink-soft';
}

export function InboxClient({
  messages,
  initialStates,
  mailbox,
  total,
  page,
  totalPages,
  tag: activeTag,
  selectedMsgId,
  selectedMsg,
  selectedSafeHtml,
  bodyForAI,
  username,
  initialViewMode = 'all',
}: InboxClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [states, setStates] = useState<Record<string, MessageState>>(initialStates);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  // Desktop reading pane: expand full header details / show raw source
  const [showDetails, setShowDetails] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    if (mode === 'all') {
      params.delete('view');
    } else {
      params.set('view', mode);
    }
    startTransition(() => { router.replace(`/inbox?${params.toString()}`, { scroll: false }); });
  }, [router, searchParams]);

  const [showHelp, setShowHelp] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);

  const getState = useCallback(
    (id: number): MessageState =>
      states[String(id)] ?? { is_read: false, is_starred: false, is_trashed: false },
    [states]
  );

  const filtered = messages.filter((msg) => {
    if (viewMode === 'unread' && getState(msg.id).is_read) return false;
    if (viewMode === 'starred' && !getState(msg.id).is_starred) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return msg.subject.toLowerCase().includes(q) || msg.from_addr.toLowerCase().includes(q);
    }
    return true;
  });

  const threadMap = new Map<string, number>();
  for (const msg of filtered) threadMap.set(threadKey(msg), (threadMap.get(threadKey(msg)) ?? 0) + 1);
  const seenThreads = new Set<string>();
  const threaded = filtered.map((msg) => {
    const key = threadKey(msg);
    const count = threadMap.get(key) ?? 1;
    const isHead = !seenThreads.has(key);
    if (isHead) seenThreads.add(key);
    return { msg, threadCount: count, isThreadHead: isHead };
  });

  const openMessage = useCallback((id: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('msg', String(id));
    startTransition(() => { router.push(`/inbox?${params.toString()}`, { scroll: false }); });
    // Reset detail/source panels on new message
    setShowDetails(false);
    setShowSource(false);
    // Mark read optimistically
    setStates(prev => ({
      ...prev,
      [String(id)]: {
        ...(prev[String(id)] ?? { is_read: false, is_starred: false, is_trashed: false }),
        is_read: true,
      },
    }));
    fetch(`/api/message-states/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: true }),
    }).catch(() => {});
  }, [router, searchParams]);

  const closePane = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('msg');
    startTransition(() => { router.push(`/inbox?${params.toString()}`, { scroll: false }); });
  }, [router, searchParams]);

  const patchState = useCallback(async (id: number, patch: Partial<MessageState>) => {
    const pre = states[String(id)] ?? { is_read: false, is_starred: false, is_trashed: false };
    setStates(prev => ({ ...prev, [String(id)]: { ...pre, ...patch } }));
    try {
      await fetch(`/api/message-states/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {
      setStates(prev => ({ ...prev, [String(id)]: pre }));
    }
  }, [states]);

  const toggleStar = useCallback((e: React.MouseEvent | React.KeyboardEvent, id: number) => {
    e.stopPropagation();
    patchState(id, { is_starred: !getState(id).is_starred });
  }, [getState, patchState]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).contentEditable === 'true') {
        if (e.key === 'Escape') { setSearchQuery(''); (e.target as HTMLInputElement).blur?.(); }
        return;
      }
      switch (e.key) {
        case 'j': setFocusedIdx(i => Math.min(i + 1, threaded.length - 1)); break;
        case 'k': setFocusedIdx(i => Math.max(i - 1, 0)); break;
        case 'Enter':
          if (focusedIdx >= 0 && threaded[focusedIdx]) openMessage(threaded[focusedIdx].msg.id);
          break;
        case 's':
          if (focusedIdx >= 0 && threaded[focusedIdx]) {
            const { msg } = threaded[focusedIdx];
            patchState(msg.id, { is_starred: !getState(msg.id).is_starred });
          }
          break;
        case 'r':
          if (selectedMsg) {
            openComposeDrawer({
              to: selectedMsg.from_addr,
              subject: `Re: ${selectedMsg.subject}`,
              inReplyTo: selectedMsg.message_id || '',
            });
          }
          break;
        case '/': e.preventDefault(); searchRef.current?.focus(); break;
        case '?': setShowHelp(v => !v); break;
        case 'Escape':
          if (selectedMsgId) closePane();
          else { setShowHelp(false); setFocusedIdx(-1); }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedIdx, threaded, getState, patchState, openMessage, closePane, selectedMsg, selectedMsgId, router]);

  useEffect(() => {
    if (focusedIdx >= 0) rowRefs.current[focusedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIdx]);

  const unreadCount = messages.filter(m => !getState(m.id).is_read).length;
  const replyHref = selectedMsg
    ? `/compose?replyTo=${encodeURIComponent(selectedMsg.from_addr)}&subject=${encodeURIComponent(`Re: ${selectedMsg.subject}`)}&inReplyTo=${encodeURIComponent(selectedMsg.message_id || '')}`
    : '#';

  return (
    <div className="flex-1 flex overflow-hidden min-h-0">
      {/* ── LEFT PANE: message list ── */}
      {/* On mobile: hide when message selected. On desktop: show as narrow pane */}
      <div className={`flex flex-col overflow-hidden border-r border-rule bg-cream transition-all duration-200 ${
        selectedMsgId
          ? 'hidden sm:flex sm:w-80 sm:flex-shrink-0'
          : 'flex-1'
      }`}>
        {/* Toolbar */}
        <div className="px-4 pt-3 pb-2 border-b border-rule flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-sans font-semibold text-ink capitalize truncate">
                {activeTag ? `#${activeTag}` : mailbox}
              </h1>
              {unreadCount > 0 && (
                <span className="text-xs bg-teal text-cream rounded-full px-2 py-0.5 font-sans font-medium flex-shrink-0">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {(['all', 'unread', 'starred'] as ViewMode[]).map(mode => (
                <button key={mode} onClick={() => changeViewMode(mode)}
                  className={`text-xs px-2 py-1 rounded font-sans transition-colors capitalize ${viewMode === mode ? 'bg-teal text-cream font-medium' : 'text-ink-soft hover:text-ink'}`}>
                  {mode}
                </button>
              ))}
              <button onClick={() => setShowHelp(v => !v)} className="hidden sm:block text-ink-soft hover:text-ink ml-1" title="?">
                <HelpCircle size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={12} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
            <input ref={searchRef} type="text" placeholder="Filter… ( / )" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs font-sans bg-[#f0ede4] border border-rule rounded text-ink placeholder:text-ink-soft focus:outline-none focus:border-teal" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink">
                <X size={12} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {/* Message rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-rule">
          {filtered.length === 0 && (
            <div className="p-8 text-ink-soft text-center text-sm font-sans">
              {searchQuery ? 'No matches.' : 'No messages.'}
            </div>
          )}
          {threaded.map(({ msg, threadCount, isThreadHead }, idx) => {
            const state = getState(msg.id);
            const isFocused = focusedIdx === idx;
            const isSelected = selectedMsgId === msg.id;
            return (
              <div key={msg.id}
                ref={el => { rowRefs.current[idx] = el; }}
                role="row"
                onClick={() => openMessage(msg.id)}
                onKeyDown={e => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ' || e.key === 'o') {
                    if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
                    openMessage(msg.id);
                  }
                }}
                tabIndex={0}
                className={`flex items-start gap-2 px-3 py-2.5 transition-colors group cursor-pointer ${isSelected ? 'bg-teal/10 border-l-2 border-teal' : isFocused ? 'bg-[#f0ede4]' : 'hover:bg-[#f0ede4]'}`}>
                {/* Unread dot */}
                <div className="flex-shrink-0 mt-1.5 w-1.5 h-1.5">
                  {!state.is_read && <div className="w-1.5 h-1.5 rounded-full bg-teal-strong" />}
                </div>
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full ${avatarColor(msg.from_addr)} flex items-center justify-center text-xs font-bold text-cream flex-shrink-0`}>
                  {avatarInitial(msg.from_addr)}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs truncate ${state.is_read ? 'text-ink-soft' : 'text-ink font-semibold'}`}>
                      {formatFromAddr(msg.from_addr)}
                    </span>
                    <span className="text-xs text-ink-soft flex-shrink-0" suppressHydrationWarning>{formatDate(msg.received_at)}</span>
                  </div>
                  <div className={`text-xs truncate mt-0.5 ${state.is_read ? 'text-ink-soft' : 'text-ink'}`}>
                    {msg.subject}
                    {threadCount > 1 && isThreadHead && (
                      <span className="ml-1 text-ink-soft">({threadCount})</span>
                    )}
                  </div>
                  {/* Tags row */}
                  {(msg.tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {msg.tags!.map(t => (
                        <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded font-sans ${tagColor(t)}`}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Icons — star is a proper <button> sibling (not nested inside another button) */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <button
                    type="button"
                    aria-label={state.is_starred ? 'Unstar' : 'Star'}
                    onClick={e => toggleStar(e, msg.id)}
                    className="focus:outline-none cursor-pointer"
                  >
                    <Star size={12} strokeWidth={1.5} className={state.is_starred ? 'fill-[#d8a14a] text-[#d8a14a]' : 'text-rule group-hover:text-ink-soft'} />
                  </button>
                  {(msg.attachments_meta?.length ?? 0) > 0 && (
                    <Paperclip size={11} className="text-ink-soft" strokeWidth={1.75} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 px-4 py-2 border-t border-rule text-xs font-sans flex-shrink-0">
            {page > 1 && (
              <Link href={`/inbox?mailbox=${mailbox}&page=${page - 1}${activeTag ? `&tag=${activeTag}` : ''}`} className="text-teal-strong hover:underline">Prev</Link>
            )}
            <span className="text-ink-soft">{page}/{totalPages}</span>
            {page < totalPages && (
              <Link href={`/inbox?mailbox=${mailbox}&page=${page + 1}${activeTag ? `&tag=${activeTag}` : ''}`} className="text-teal-strong hover:underline">Next</Link>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT PANE: reading pane ── */}
      {/* On mobile: full screen when message selected. On desktop: flex alongside list */}
      {selectedMsgId && selectedMsg ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-cream min-w-0">
          {/* Pane toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-rule bg-cream flex-shrink-0">
            <button onClick={closePane} className="flex items-center gap-1 text-xs font-sans text-ink-soft hover:text-ink transition-colors" title="Back to list">
              <ArrowLeft size={15} strokeWidth={1.75} />
              <span className="sm:hidden">Back</span>
            </button>
            {/* MessageActions — fixed layout so buttons never wrap/misalign */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <MessageActions
                messageId={selectedMsg.id}
                initialStarred={states[String(selectedMsg.id)]?.is_starred ?? false}
                initialRead={states[String(selectedMsg.id)]?.is_read ?? true}
                initialTrashed={states[String(selectedMsg.id)]?.is_trashed ?? false}
                replyHref={replyHref}
                backHref={`/inbox?mailbox=${mailbox}`}
              />
            </div>
            <div className="flex-1" />
            {/* Desktop-only: details + source toggles */}
            <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => { setShowDetails(v => !v); setShowSource(false); }}
                className={`flex items-center gap-1 text-xs font-sans px-2 py-1 rounded transition-colors ${showDetails ? 'bg-rule text-ink' : 'text-ink-soft hover:text-ink'}`}
                title="Show message details"
              >
                {showDetails ? <ChevronUp size={12} strokeWidth={2} /> : <ChevronDown size={12} strokeWidth={2} />}
                Details
              </button>
              <button
                onClick={() => { setShowSource(v => !v); setShowDetails(false); }}
                className={`flex items-center gap-1 text-xs font-sans px-2 py-1 rounded transition-colors ${showSource ? 'bg-rule text-ink' : 'text-ink-soft hover:text-ink'}`}
                title="View email source"
              >
                <Code2 size={12} strokeWidth={2} />
                Source
              </button>
            </div>
            {/* Tags on selected message - hidden on mobile for space */}
            {(selectedMsg.tags?.length ?? 0) > 0 && (
              <div className="hidden sm:flex items-center gap-1">
                <Tag size={12} strokeWidth={1.75} className="text-ink-soft" />
                {selectedMsg.tags!.map(t => (
                  <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded font-sans ${tagColor(t)}`}>{t}</span>
                ))}
              </div>
            )}
            <Link href={`/inbox/${selectedMsg.id}?mailbox=${mailbox}`} className="text-ink-soft hover:text-ink transition-colors" title="Open full page">
              <ExternalLink size={13} strokeWidth={1.75} />
            </Link>
          </div>

          {/* Message content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
              <h1 className="text-base sm:text-lg font-serif font-semibold text-ink mb-3 sm:mb-4 leading-snug">{selectedMsg.subject}</h1>

              {/* Tags on mobile - show below subject */}
              {(selectedMsg.tags?.length ?? 0) > 0 && (
                <div className="sm:hidden flex flex-wrap items-center gap-1 mb-3">
                  <Tag size={11} strokeWidth={1.75} className="text-ink-soft" />
                  {selectedMsg.tags!.map(t => (
                    <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded font-sans ${tagColor(t)}`}>{t}</span>
                  ))}
                </div>
              )}

              {bodyForAI && (
                <AISummary messageId={selectedMsg.id} subject={selectedMsg.subject} from={selectedMsg.from_addr} body={bodyForAI} />
              )}

              {/* Header card — condensed by default, expanded when showDetails */}
              <div className="bg-[#f0ede4] rounded-card p-3 mb-4">
                {/* Always-visible summary line */}
                <div className="flex items-start gap-2">
                  <div className={`w-8 h-8 rounded-full ${avatarColor(selectedMsg.from_addr)} flex items-center justify-center text-sm font-bold text-cream flex-shrink-0`}>
                    {avatarInitial(selectedMsg.from_addr)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-sans font-semibold text-ink truncate">
                        {formatFromAddr(selectedMsg.from_addr)}
                      </span>
                      <span className="text-xs text-ink-soft flex-shrink-0" suppressHydrationWarning>
                        {new Date(selectedMsg.received_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-ink-soft font-sans mt-0.5 truncate">
                      To: {selectedMsg.to_addrs.map(a => formatDisplayName(a)).join(', ')}
                      {selectedMsg.cc_addrs.length > 0 && ` · CC: ${selectedMsg.cc_addrs.map(a => formatDisplayName(a)).join(', ')}`}
                    </div>
                  </div>
                </div>

                {/* Expanded details — desktop only, toggled via toolbar button */}
                {showDetails && (
                  <dl className="mt-3 pt-3 border-t border-rule grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs font-sans">
                    <dt className="font-medium text-ink-soft">From</dt>
                    <dd className="text-ink break-all">{selectedMsg.from_addr}</dd>
                    <dt className="font-medium text-ink-soft">To</dt>
                    <dd className="text-ink break-all">{selectedMsg.to_addrs.map(a => `${a.name ? a.name + ' ' : ''}<${a.address}>`).join(', ')}</dd>
                    {selectedMsg.cc_addrs.length > 0 && (
                      <>
                        <dt className="font-medium text-ink-soft">CC</dt>
                        <dd className="text-ink break-all">{selectedMsg.cc_addrs.map(a => `${a.name ? a.name + ' ' : ''}<${a.address}>`).join(', ')}</dd>
                      </>
                    )}
                    {selectedMsg.message_id && (
                      <>
                        <dt className="font-medium text-ink-soft">Message-ID</dt>
                        <dd className="text-ink-soft break-all font-mono text-[10px]">{selectedMsg.message_id}</dd>
                      </>
                    )}
                    {selectedMsg.in_reply_to && (
                      <>
                        <dt className="font-medium text-ink-soft">In-Reply-To</dt>
                        <dd className="text-ink-soft break-all font-mono text-[10px]">{selectedMsg.in_reply_to}</dd>
                      </>
                    )}
                    <dt className="font-medium text-ink-soft">Mailbox</dt>
                    <dd className="text-ink font-mono">{selectedMsg.mailbox}</dd>
                  </dl>
                )}
              </div>

              {/* Source view — raw HTML/text, desktop only */}
              {showSource ? (
                <div className="border border-rule rounded-card overflow-hidden mb-4">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0ede4] border-b border-rule">
                    <span className="text-xs font-sans font-medium text-ink-soft uppercase tracking-wider">Email source</span>
                    <button onClick={() => setShowSource(false)} className="text-ink-soft hover:text-ink">
                      <X size={12} strokeWidth={2} />
                    </button>
                  </div>
                  <pre className="overflow-x-auto p-4 text-[11px] font-mono text-ink leading-relaxed bg-cream whitespace-pre-wrap break-all max-h-[60vh]">
                    {/* Cap at 50 KB to prevent page jank on large HTML emails */}
                    {(selectedMsg.html_body || selectedMsg.text_body || '(no body)').slice(0, 50_000)}
                    {(selectedMsg.html_body || selectedMsg.text_body || '').length > 50_000 && '\n\n… (truncated at 50 KB)'}
                  </pre>
                </div>
              ) : (
                /* Body */
                <div className="border-t border-rule pt-4 text-sm">
                  {selectedSafeHtml ? (
                    <div className="prose prose-sm sm:prose max-w-none overflow-x-auto" dangerouslySetInnerHTML={{ __html: selectedSafeHtml }} />
                  ) : selectedMsg.text_body ? (
                    <pre className="whitespace-pre-wrap font-mono text-xs sm:text-sm text-ink leading-relaxed overflow-x-auto">{selectedMsg.text_body}</pre>
                  ) : (
                    <p className="text-ink-soft italic text-sm font-sans">No body content.</p>
                  )}
                </div>
              )}

              {/* Attachments */}
              {(selectedMsg.attachments_meta?.length ?? 0) > 0 && (
                <div className="mt-6 border-t border-rule pt-4">
                  <div className="flex items-center gap-1.5 text-xs font-sans font-semibold text-ink-soft uppercase tracking-wider mb-2">
                    <Paperclip size={11} strokeWidth={2} />
                    Attachments ({(selectedMsg.attachments_meta?.length ?? 0)})
                  </div>
                  <ul className="space-y-1">
                    {selectedMsg.attachments_meta?.map((a, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs font-sans">
                        <Paperclip size={11} strokeWidth={1.75} className="text-ink-soft flex-shrink-0" />
                        <span className="text-ink truncate">{a.filename}</span>
                        <span className="text-ink-soft flex-shrink-0">({(a.size / 1024).toFixed(1)}KB)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reply / Forward */}
              <div className="mt-6 pt-4 border-t border-rule flex flex-wrap gap-2">
                <button
                  onClick={() => openComposeDrawer({
                    to: selectedMsg.from_addr,
                    subject: `Re: ${selectedMsg.subject}`,
                    inReplyTo: selectedMsg.message_id || '',
                  })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal hover:bg-teal-strong text-cream rounded-card text-xs font-sans font-medium transition-colors"
                >
                  <Reply size={12} strokeWidth={2} /> Reply
                </button>
                <button
                  onClick={() => openComposeDrawer({ subject: `Fwd: ${selectedMsg.subject}` })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rule hover:bg-[#d8d4cb] text-ink rounded-card text-xs font-sans transition-colors"
                >
                  <Forward size={12} strokeWidth={2} /> Forward
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : !selectedMsgId ? null : (
        /* selected ID but message not found */
        <div className="flex-1 flex items-center justify-center text-ink-soft text-sm font-sans p-4">
          Message not found.
        </div>
      )}

      {/* Help modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-cream rounded-card shadow-xl p-6 max-w-sm w-full border border-rule" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif font-semibold text-ink">Keyboard shortcuts</h2>
              <button onClick={() => setShowHelp(false)} className="text-ink-soft hover:text-ink"><X size={16} strokeWidth={2} /></button>
            </div>
            <dl className="grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-2 text-sm font-sans">
              {[['j / k','Navigate'], ['Enter','Open in pane'], ['s','Star selected'], ['r','Reply (pane)'], ['/','Search'], ['Esc','Close pane'], ['?','This help']].map(([k, d]) => (
                <Fragment key={k}>
                  <dt className="font-mono text-teal-strong font-medium">{k}</dt>
                  <dd className="text-ink-soft">{d}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
