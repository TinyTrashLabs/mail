'use client';

/**
 * InboxClient — Gmail-style two-pane layout with right-click context menus,
 * bottom compose tray, AI auto-tag, and per-row add-tag dialog.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Paperclip, Star, Search, X, HelpCircle, Reply, Forward,
  Tag, ArrowLeft, ExternalLink, Sparkles,
} from 'lucide-react';
import { AISummary } from '@/components/AISummary';
import { MessageActions } from '@/components/MessageActions';
import { ComposeTray, ComposeInit } from '@/components/ComposeTray';
import { MessageContextMenu, ContextMenuPos } from '@/components/MessageContextMenu';
import { AddTagDialog } from '@/components/AddTagDialog';

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
  fullName: string;
  composeOpen: boolean;
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
  fullName,
  composeOpen,
}: InboxClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [states, setStates] = useState<Record<string, MessageState>>(initialStates);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [showHelp, setShowHelp] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ pos: ContextMenuPos; msgId: number } | null>(null);
  // Add-tag dialog state
  const [addTagFor, setAddTagFor] = useState<{ msgId: number; existing: string[] } | null>(null);
  // Compose tray init payload (changes when reply/forward opened)
  const [composeInit, setComposeInit] = useState<ComposeInit>({});
  // Local copy of tags-per-message (lets us update in place after auto-tag/add)
  const [tagsByMsg, setTagsByMsg] = useState<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const m of messages) out[String(m.id)] = m.tags ?? [];
    if (selectedMsg) out[String(selectedMsg.id)] = selectedMsg.tags ?? [];
    return out;
  });

  // Suppress unused-var warnings for props consumed indirectly via display name.
  void total;
  void fullName;

  const getState = useCallback(
    (id: number): MessageState => states[String(id)] ?? { is_read: false, is_starred: false },
    [states]
  );

  const getTags = useCallback(
    (id: number): string[] => tagsByMsg[String(id)] ?? [],
    [tagsByMsg]
  );

  const filtered = useMemo(() => messages.filter((msg) => {
    if (viewMode === 'unread' && getState(msg.id).is_read) return false;
    if (viewMode === 'starred' && !getState(msg.id).is_starred) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return msg.subject.toLowerCase().includes(q) || msg.from_addr.toLowerCase().includes(q);
    }
    return true;
  }), [messages, viewMode, searchQuery, getState]);

  const threaded = useMemo(() => {
    const threadMap = new Map<string, number>();
    for (const msg of filtered) threadMap.set(threadKey(msg), (threadMap.get(threadKey(msg)) ?? 0) + 1);
    const seenThreads = new Set<string>();
    return filtered.map((msg) => {
      const key = threadKey(msg);
      const count = threadMap.get(key) ?? 1;
      const isHead = !seenThreads.has(key);
      if (isHead) seenThreads.add(key);
      return { msg, threadCount: count, isThreadHead: isHead };
    });
  }, [filtered]);

  const openMessage = useCallback((id: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('msg', String(id));
    startTransition(() => { router.push(`/inbox?${params.toString()}`, { scroll: false }); });
    setStates(prev => ({
      ...prev,
      [String(id)]: { ...(prev[String(id)] ?? { is_read: false, is_starred: false }), is_read: true },
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
    const pre = states[String(id)] ?? { is_read: false, is_starred: false };
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

  const toggleStar = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    patchState(id, { is_starred: !getState(id).is_starred });
  }, [getState, patchState]);

  // Compose URL state machine
  const openCompose = useCallback((init: ComposeInit = {}) => {
    setComposeInit(init);
    const params = new URLSearchParams(searchParams.toString());
    params.set('compose', '1');
    startTransition(() => { router.push(`/inbox?${params.toString()}`, { scroll: false }); });
  }, [router, searchParams]);

  const closeCompose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('compose');
    startTransition(() => { router.push(`/inbox?${params.toString()}`, { scroll: false }); });
  }, [router, searchParams]);

  // Helpers to build reply/forward init from any Message (need full payload for full reply)
  const buildReplyInit = useCallback(async (msgId: number): Promise<ComposeInit> => {
    try {
      const res = await fetch(`/api/messages/${msgId}?mailbox=${encodeURIComponent(mailbox)}`);
      if (!res.ok) return {};
      const m = await res.json();
      return {
        to: m.from_addr,
        subject: `Re: ${m.subject.replace(/^re:\s*/i, '')}`,
        inReplyTo: m.message_id || '',
      };
    } catch {
      return {};
    }
  }, [mailbox]);

  const buildForwardInit = useCallback(async (msgId: number): Promise<ComposeInit> => {
    try {
      const res = await fetch(`/api/messages/${msgId}?mailbox=${encodeURIComponent(mailbox)}`);
      if (!res.ok) return {};
      const m = await res.json();
      return {
        subject: `Fwd: ${m.subject.replace(/^fwd?:\s*/i, '')}`,
        body: `\n\n--- Forwarded ---\nFrom: ${m.from_addr}\nDate: ${m.received_at}\nSubject: ${m.subject}\n\n${m.text_body || ''}`,
      };
    } catch {
      return {};
    }
  }, [mailbox]);

  // Auto-tag via AI
  const autoTag = useCallback(async (msgId: number) => {
    try {
      const detail = await fetch(`/api/messages/${msgId}?mailbox=${encodeURIComponent(mailbox)}`).then(r => r.ok ? r.json() : null);
      if (!detail) return;
      const res = await fetch('/api/ai/auto-tag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: detail.subject,
          from: detail.from_addr,
          body: detail.text_body || '',
          existingTags: getTags(msgId),
        }),
      });
      if (!res.ok) return;
      const { tags } = await res.json();
      if (!Array.isArray(tags) || tags.length === 0) return;
      // Apply tags
      const applyRes = await fetch(`/api/messages/${msgId}/tags`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags, source: 'ai' }),
      });
      if (applyRes.ok) {
        setTagsByMsg(prev => {
          const cur = new Set(prev[String(msgId)] ?? []);
          for (const t of tags) cur.add(t);
          return { ...prev, [String(msgId)]: Array.from(cur) };
        });
      }
    } catch { /* swallow */ }
  }, [mailbox, getTags]);

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
            openCompose({
              to: selectedMsg.from_addr,
              subject: `Re: ${selectedMsg.subject.replace(/^re:\s*/i, '')}`,
              inReplyTo: selectedMsg.message_id || '',
            });
          }
          break;
        case 'c': openCompose({}); break;
        case '/': e.preventDefault(); searchRef.current?.focus(); break;
        case '?': setShowHelp(v => !v); break;
        case 'Escape':
          if (ctxMenu) setCtxMenu(null);
          else if (addTagFor) setAddTagFor(null);
          else if (selectedMsgId) closePane();
          else { setShowHelp(false); setFocusedIdx(-1); }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedIdx, threaded, getState, patchState, openMessage, closePane, selectedMsg, selectedMsgId, ctxMenu, addTagFor, openCompose]);

  // Listen for sidebar "open shortcuts" custom event
  useEffect(() => {
    const onOpenHelp = () => setShowHelp(true);
    window.addEventListener('mail:open-shortcuts', onOpenHelp as EventListener);
    return () => window.removeEventListener('mail:open-shortcuts', onOpenHelp as EventListener);
  }, []);

  useEffect(() => {
    if (focusedIdx >= 0) rowRefs.current[focusedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIdx]);

  const unreadCount = messages.filter(m => !getState(m.id).is_read).length;

  // Reply action handler for reading-pane buttons (now opens tray instead of /compose)
  const onReplyFromPane = useCallback(() => {
    if (!selectedMsg) return;
    openCompose({
      to: selectedMsg.from_addr,
      subject: `Re: ${selectedMsg.subject.replace(/^re:\s*/i, '')}`,
      inReplyTo: selectedMsg.message_id || '',
    });
  }, [selectedMsg, openCompose]);

  const onForwardFromPane = useCallback(() => {
    if (!selectedMsg) return;
    openCompose({
      subject: `Fwd: ${selectedMsg.subject.replace(/^fwd?:\s*/i, '')}`,
      body: `\n\n--- Forwarded ---\nFrom: ${selectedMsg.from_addr}\nDate: ${selectedMsg.received_at}\nSubject: ${selectedMsg.subject}\n\n${selectedMsg.text_body || ''}`,
    });
  }, [selectedMsg, openCompose]);

  // Context menu actions builder
  const buildMenuActions = useCallback((msgId: number) => {
    return {
      onOpenInPane: () => { openMessage(msgId); setCtxMenu(null); },
      onOpenFullPage: () => {
        router.push(`/inbox/${msgId}?mailbox=${mailbox}`);
        setCtxMenu(null);
      },
      onReply: async () => {
        setCtxMenu(null);
        const init = await buildReplyInit(msgId);
        openCompose(init);
      },
      onForward: async () => {
        setCtxMenu(null);
        const init = await buildForwardInit(msgId);
        openCompose(init);
      },
      onToggleStar: () => {
        patchState(msgId, { is_starred: !getState(msgId).is_starred });
        setCtxMenu(null);
      },
      onToggleRead: () => {
        patchState(msgId, { is_read: !getState(msgId).is_read });
        setCtxMenu(null);
      },
      onAddTag: () => {
        setAddTagFor({ msgId, existing: getTags(msgId) });
        setCtxMenu(null);
      },
      onAutoTag: () => {
        setCtxMenu(null);
        autoTag(msgId);
      },
      isStarred: getState(msgId).is_starred,
      isRead: getState(msgId).is_read,
    };
  }, [openMessage, router, mailbox, buildReplyInit, buildForwardInit, openCompose, patchState, getState, getTags, autoTag]);

  return (
    <div className="flex-1 flex overflow-hidden min-h-0">
      {/* ── LEFT PANE: message list ── */}
      <div className={`flex flex-col overflow-hidden border-r border-rule bg-cream transition-all duration-200 ${selectedMsgId ? 'w-80 flex-shrink-0' : 'flex-1'}`}>
        {/* Toolbar */}
        <div className="px-4 pt-3 pb-2 border-b border-rule flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-sans font-semibold text-ink capitalize">
                {activeTag ? `#${activeTag}` : mailbox}
              </h1>
              {unreadCount > 0 && (
                <span className="text-xs bg-teal text-cream rounded-full px-2 py-0.5 font-sans font-medium">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {(['all', 'unread', 'starred'] as ViewMode[]).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className={`text-xs px-2 py-1 rounded font-sans transition-colors capitalize ${viewMode === mode ? 'bg-teal text-cream font-medium' : 'text-ink-soft hover:text-ink'}`}>
                  {mode}
                </button>
              ))}
              <button onClick={() => setShowHelp(v => !v)} className="text-ink-soft hover:text-ink ml-1" title="?">
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
            const rowTags = getTags(msg.id);
            const isFocused = focusedIdx === idx;
            const isSelected = selectedMsgId === msg.id;
            return (
              <button key={msg.id}
                ref={el => { rowRefs.current[idx] = el; }}
                onClick={() => openMessage(msg.id)}
                onContextMenu={e => {
                  e.preventDefault();
                  setCtxMenu({ pos: { x: e.clientX, y: e.clientY }, msgId: msg.id });
                }}
                className={`w-full text-left flex items-start gap-2 px-3 py-2.5 transition-colors group ${isSelected ? 'bg-teal/10 border-l-2 border-teal' : isFocused ? 'bg-[#f0ede4]' : 'hover:bg-[#f0ede4]'}`}>
                <div className="flex-shrink-0 mt-1.5 w-1.5 h-1.5">
                  {!state.is_read && <div className="w-1.5 h-1.5 rounded-full bg-teal-strong" />}
                </div>
                <div className={`w-7 h-7 rounded-full ${avatarColor(msg.from_addr)} flex items-center justify-center text-xs font-bold text-cream flex-shrink-0`}>
                  {avatarInitial(msg.from_addr)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs truncate ${state.is_read ? 'text-ink-soft' : 'text-ink font-semibold'}`}>
                      {msg.from_addr.split('@')[0]}
                    </span>
                    <span className="text-xs text-ink-soft flex-shrink-0">{formatDate(msg.received_at)}</span>
                  </div>
                  <div className={`text-xs truncate mt-0.5 ${state.is_read ? 'text-ink-soft' : 'text-ink'}`}>
                    {msg.subject}
                    {threadCount > 1 && isThreadHead && (
                      <span className="ml-1 text-ink-soft">({threadCount})</span>
                    )}
                  </div>
                  {rowTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {rowTags.map(t => (
                        <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded font-sans ${tagColor(t)}`}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <button onClick={e => toggleStar(e, msg.id)} className="focus:outline-none">
                    <Star size={12} strokeWidth={1.5} className={state.is_starred ? 'fill-[#d8a14a] text-[#d8a14a]' : 'text-rule group-hover:text-ink-soft'} />
                  </button>
                  {(msg.attachments_meta?.length ?? 0) > 0 && (
                    <Paperclip size={11} className="text-ink-soft" strokeWidth={1.75} />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 px-4 py-2 border-t border-rule text-xs font-sans flex-shrink-0">
            {page > 1 && (
              <Link href={`/inbox?mailbox=${mailbox}&page=${page - 1}${activeTag ? `&tag=${activeTag}` : ''}`} className="text-teal-strong hover:underline">← Prev</Link>
            )}
            <span className="text-ink-soft">{page}/{totalPages}</span>
            {page < totalPages && (
              <Link href={`/inbox?mailbox=${mailbox}&page=${page + 1}${activeTag ? `&tag=${activeTag}` : ''}`} className="text-teal-strong hover:underline">Next →</Link>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT PANE: reading pane ── */}
      {selectedMsgId && selectedMsg ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-cream min-w-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-rule bg-cream flex-shrink-0">
            <button onClick={closePane} className="flex items-center gap-1 text-xs font-sans text-ink-soft hover:text-ink transition-colors">
              <ArrowLeft size={13} strokeWidth={1.75} />
            </button>
            <MessageActions
              messageId={selectedMsg.id}
              initialStarred={states[String(selectedMsg.id)]?.is_starred ?? false}
              initialRead={states[String(selectedMsg.id)]?.is_read ?? true}
              replyHref="#"
              backHref={`/inbox?mailbox=${mailbox}`}
            />
            <div className="flex-1" />
            <button onClick={() => autoTag(selectedMsg.id)}
              className="flex items-center gap-1 text-xs font-sans text-ink-soft hover:text-teal-strong transition-colors"
              title="AI auto-tag this message">
              <Sparkles size={12} strokeWidth={1.75} /> auto-tag
            </button>
            <button onClick={() => setAddTagFor({ msgId: selectedMsg.id, existing: getTags(selectedMsg.id) })}
              className="flex items-center gap-1 text-xs font-sans text-ink-soft hover:text-ink transition-colors">
              <Tag size={12} strokeWidth={1.75} /> add tag
            </button>
            {getTags(selectedMsg.id).length > 0 && (
              <div className="flex items-center gap-1">
                {getTags(selectedMsg.id).map(t => (
                  <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded font-sans ${tagColor(t)}`}>{t}</span>
                ))}
              </div>
            )}
            <Link href={`/inbox/${selectedMsg.id}?mailbox=${mailbox}`} className="text-ink-soft hover:text-ink transition-colors" title="Open full page">
              <ExternalLink size={13} strokeWidth={1.75} />
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-6">
              <h1 className="text-lg font-serif font-semibold text-ink mb-4 leading-snug">{selectedMsg.subject}</h1>

              {bodyForAI && (
                <AISummary messageId={selectedMsg.id} subject={selectedMsg.subject} from={selectedMsg.from_addr} body={bodyForAI} />
              )}

              <div className="bg-[#f0ede4] rounded-card p-3 mb-4">
                <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs font-sans">
                  <dt className="font-medium text-ink-soft">From</dt>
                  <dd className="text-ink break-all">{selectedMsg.from_addr}</dd>
                  <dt className="font-medium text-ink-soft">To</dt>
                  <dd className="text-ink break-all">{selectedMsg.to_addrs.map(a => a.address).join(', ')}</dd>
                  {selectedMsg.cc_addrs.length > 0 && (
                    <>
                      <dt className="font-medium text-ink-soft">CC</dt>
                      <dd className="text-ink break-all">{selectedMsg.cc_addrs.map(a => a.address).join(', ')}</dd>
                    </>
                  )}
                  <dt className="font-medium text-ink-soft">Date</dt>
                  <dd className="text-ink">{new Date(selectedMsg.received_at).toLocaleString()}</dd>
                </dl>
              </div>

              <div className="border-t border-rule pt-4 text-sm">
                {selectedSafeHtml ? (
                  <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: selectedSafeHtml }} />
                ) : selectedMsg.text_body ? (
                  <pre className="whitespace-pre-wrap font-mono text-sm text-ink leading-relaxed">{selectedMsg.text_body}</pre>
                ) : (
                  <p className="text-ink-soft italic text-sm font-sans">No body content.</p>
                )}
              </div>

              {(selectedMsg.attachments_meta?.length ?? 0) > 0 && (
                <div className="mt-6 border-t border-rule pt-4">
                  <div className="flex items-center gap-1.5 text-xs font-sans font-semibold text-ink-soft uppercase tracking-wider mb-2">
                    <Paperclip size={11} strokeWidth={2} />
                    Attachments ({(selectedMsg.attachments_meta?.length ?? 0)})
                  </div>
                  <ul className="space-y-1">
                    {selectedMsg.attachments_meta?.map((a, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs font-sans">
                        <Paperclip size={11} strokeWidth={1.75} className="text-ink-soft" />
                        <span className="text-ink">{a.filename}</span>
                        <span className="text-ink-soft">({a.contentType}, {a.size}b)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-rule flex gap-2">
                <button onClick={onReplyFromPane}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal hover:bg-teal-strong text-cream rounded-card text-xs font-sans font-medium transition-colors">
                  <Reply size={12} strokeWidth={2} /> Reply
                </button>
                <button onClick={onForwardFromPane}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rule hover:bg-[#d8d4cb] text-ink rounded-card text-xs font-sans transition-colors">
                  <Forward size={12} strokeWidth={2} /> Forward
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : !selectedMsgId ? null : (
        <div className="flex-1 flex items-center justify-center text-ink-soft text-sm font-sans">
          Message not found.
        </div>
      )}

      {!selectedMsgId && messages.length > 0 && (
        <div className="hidden" />
      )}

      {/* Context menu */}
      {ctxMenu && (
        <MessageContextMenu
          pos={ctxMenu.pos}
          actions={buildMenuActions(ctxMenu.msgId)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Add-tag dialog */}
      {addTagFor && (
        <AddTagDialog
          messageId={addTagFor.msgId}
          existingTags={addTagFor.existing}
          onClose={() => setAddTagFor(null)}
          onAdded={(tags) => {
            setTagsByMsg(prev => {
              const cur = new Set(prev[String(addTagFor.msgId)] ?? []);
              for (const t of tags) cur.add(t);
              return { ...prev, [String(addTagFor.msgId)]: Array.from(cur) };
            });
            setAddTagFor(null);
          }}
        />
      )}

      {/* Compose tray */}
      <ComposeTray open={composeOpen} init={composeInit} onClose={closeCompose} />

      {/* Help modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center" onClick={() => setShowHelp(false)}>
          <div className="bg-cream rounded-card shadow-xl p-6 max-w-sm w-full mx-4 border border-rule" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif font-semibold text-ink">Keyboard shortcuts</h2>
              <button onClick={() => setShowHelp(false)} className="text-ink-soft hover:text-ink"><X size={16} strokeWidth={2} /></button>
            </div>
            <dl className="grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-2 text-sm font-sans">
              {[['j / k','Navigate'], ['Enter','Open in pane'], ['s','Star selected'], ['r','Reply'], ['c','Compose'], ['/','Search'], ['right-click','Row menu'], ['Esc','Close'], ['?','This help']].map(([k, d]) => (
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
