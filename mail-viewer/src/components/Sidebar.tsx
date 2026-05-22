'use client';
import Link from 'next/link';
import { Inbox, PenSquare, Users, Tag } from 'lucide-react';

interface SidebarProps {
  username: string;
  mailbox: string;
  tag?: string;
}

const KNOWN_TAGS = ['important', 'action', 'newsletter', 'notification', 'receipt'];
const TAG_DOT: Record<string, string> = {
  important: 'bg-[#d8a14a]',
  action: 'bg-teal-strong',
  newsletter: 'bg-[#7b8bb3]',
  notification: 'bg-[#6db28b]',
  receipt: 'bg-[#b37b9e]',
};

export function Sidebar({ username, mailbox, tag: activeTag }: SidebarProps) {
  const navItems = [
    ...(username
      ? [{ label: `${username}@`, href: `/inbox?mailbox=${username}`, icon: Inbox, active: mailbox === username && !activeTag }]
      : []),
    { label: 'Shared', href: '/inbox?mailbox=shared', icon: Users, active: mailbox === 'shared' && !activeTag },
  ];

  return (
    <aside className="hidden sm:flex w-52 bg-[#f0ede4] border-r border-rule flex-col h-full flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-rule">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ttl-mascot-logo.png" alt="TTL" width={28} height={28} className="rounded-sm flex-shrink-0" />
        <span className="text-sm font-serif font-semibold text-ink leading-tight">TTL Mail</span>
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
              className={`flex items-center gap-2.5 px-3 py-2 rounded-card text-sm font-sans transition-colors ${item.active ? 'bg-teal text-cream font-medium' : 'text-ink-soft hover:bg-rule hover:text-ink'}`}>
              <Icon size={15} strokeWidth={1.75} className="flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Tags */}
      <div className="px-2 pt-3 pb-1">
        <div className="flex items-center gap-1.5 px-3 mb-1">
          <Tag size={12} strokeWidth={1.75} className="text-ink-soft" />
          <span className="text-xs font-sans font-semibold text-ink-soft uppercase tracking-wide">Tags</span>
        </div>
        {KNOWN_TAGS.map(t => (
          <Link key={t} href={`/inbox?mailbox=${mailbox}&tag=${t}`}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-card text-sm font-sans transition-colors ${activeTag === t ? 'bg-teal text-cream font-medium' : 'text-ink-soft hover:bg-rule hover:text-ink'}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TAG_DOT[t] || 'bg-ink-soft'}`} />
            {t}
          </Link>
        ))}
      </div>

      <div className="flex-1" />
    </aside>
  );
}
