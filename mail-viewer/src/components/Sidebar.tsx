'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Inbox, PenSquare, Users, Tag, LogOut, Trash2, Send } from 'lucide-react';
import { sentMailboxFor, isOwnSentMailbox } from '@/lib/mailbox';

interface SidebarProps {
  username: string;
  fullName?: string;
  mailbox: string;
  tag?: string;
  trashView?: boolean;
}

interface TagRow { tag: string; count: number | string }

const TAG_DOT_PALETTE = ['bg-[#d8a14a]', 'bg-teal-strong', 'bg-[#7b8bb3]', 'bg-[#6db28b]', 'bg-[#b37b9e]'];
function tagDot(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_DOT_PALETTE[h % TAG_DOT_PALETTE.length];
}

export function Sidebar({ username, fullName, mailbox, tag: activeTag, trashView }: SidebarProps) {
  const [tags, setTags] = useState<TagRow[]>([]);
  const displayName = (fullName && fullName !== username) ? fullName : username;

  // Pull the live tag list for the current mailbox so the sidebar reflects
  // reality (not a hardcoded constant). Cached briefly on the API side.
  useEffect(() => {
    let cancel = false;
    fetch(`/api/tags?mailbox=${encodeURIComponent(mailbox)}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows) => {
        if (cancel || !Array.isArray(rows)) return;
        setTags(rows.slice(0, 12)); // cap so sidebar doesn't blow up
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [mailbox]);

  const sentBox = username ? sentMailboxFor(username) : '';
  const navItems = [
    ...(username
      ? [{ label: `${displayName}'s inbox`, sub: `${username}@`, href: `/inbox?mailbox=${username}`, icon: Inbox, active: mailbox === username && !activeTag && !trashView }]
      : []),
    { label: 'Shared', sub: 'team mail', href: '/inbox?mailbox=shared', icon: Users, active: mailbox === 'shared' && !activeTag && !trashView },
    ...(sentBox
      ? [{ label: 'Sent', sub: 'mail you sent', href: `/inbox?mailbox=${encodeURIComponent(sentBox)}`, icon: Send, active: isOwnSentMailbox(mailbox, username) && !activeTag && !trashView }]
      : []),
    { label: 'Trash', sub: 'recently deleted', href: `/inbox?mailbox=${encodeURIComponent(mailbox)}&trash=1`, icon: Trash2, active: !!trashView },
  ];

  return (
    <aside className="hidden sm:flex w-52 bg-[#f0ede4] border-r border-rule flex-col h-full flex-shrink-0">
      {/* Logo + display name */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-rule">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ttl-mascot-logo.png" alt="TTL" width={28} height={28} className="rounded-sm flex-shrink-0" />
        <div className="flex flex-col min-w-0 leading-tight">
          <span className="text-sm font-serif font-semibold text-ink truncate">TTL Mail</span>
          <span className="text-[10px] font-sans text-ink-soft truncate" title={username ? `${username}@` : ''}>
            {displayName || 'signed out'}
          </span>
        </div>
      </div>

      {/* Compose */}
      <div className="px-3 pt-3 pb-2">
        <Link href="/compose"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-teal hover:bg-teal-strong text-cream rounded-card text-sm font-sans font-medium transition-colors">
          <PenSquare size={14} strokeWidth={2} />
          Compose
        </Link>
      </div>

      {/* Mailboxes */}
      <nav className="px-2 py-1 space-y-0.5">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-card text-sm font-sans transition-colors ${item.active ? 'bg-teal text-cream font-medium' : 'text-ink-soft hover:bg-rule hover:text-ink'}`}>
              <Icon size={15} strokeWidth={1.75} className="flex-shrink-0 mt-0.5" />
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="truncate">{item.label}</span>
                <span className={`text-[10px] truncate ${item.active ? 'text-cream/70' : 'text-ink-soft/70'}`}>{item.sub}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Tags */}
      <div className="px-2 pt-3 pb-1">
        <div className="flex items-center justify-between gap-1.5 px-3 mb-1">
          <div className="flex items-center gap-1.5">
            <Tag size={12} strokeWidth={1.75} className="text-ink-soft" />
            <span className="text-xs font-sans font-semibold text-ink-soft uppercase tracking-wide">Tags</span>
          </div>
          <Link href={`/inbox/tags?mailbox=${encodeURIComponent(mailbox)}`} className="text-[10px] text-ink-soft hover:text-ink font-sans" title="Manage tags">manage</Link>
        </div>
        {tags.length === 0 ? (
          <div className="px-3 py-1 text-[11px] font-sans text-ink-soft/60 italic">No tags yet</div>
        ) : (
          tags.map(({ tag }) => (
            <Link key={tag} href={`/inbox?mailbox=${encodeURIComponent(mailbox)}&tag=${encodeURIComponent(tag)}`}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-card text-sm font-sans transition-colors ${activeTag === tag ? 'bg-teal text-cream font-medium' : 'text-ink-soft hover:bg-rule hover:text-ink'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tagDot(tag)}`} />
              <span className="truncate">{tag}</span>
            </Link>
          ))
        )}
      </div>

      <div className="flex-1" />

      {/* Footer */}
      <div className="border-t border-rule px-2 py-2 space-y-0.5">
        <Link href="/api/auth/signout"
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-card text-xs font-sans text-ink-soft hover:bg-rule hover:text-ink transition-colors w-full">
          <LogOut size={12} strokeWidth={1.75} />
          Sign out
        </Link>
      </div>
    </aside>
  );
}
