'use client';
import Link from 'next/link';
import {
  Inbox,
  PenSquare,
  Users,
} from 'lucide-react';

interface SidebarProps {
  username: string;
  mailbox: string;
}

export function Sidebar({ username, mailbox }: SidebarProps) {
  // Only link to mailboxes that are actually implemented
  const navItems = [
    ...(username
      ? [{
          label: `${username}@`,
          href: `/inbox?mailbox=${username}`,
          icon: Inbox,
          active: mailbox === username,
        }]
      : []),
    {
      label: 'Shared',
      href: '/inbox?mailbox=shared',
      icon: Users,
      active: mailbox === 'shared',
    },
  ];

  return (
    <aside className="w-52 bg-[#f0ede4] border-r border-rule flex flex-col h-full flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-rule">
        {/* Plain <img> — bypasses next/image optimizer (no sharp installed in production image). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ttl-mascot-logo.png"
          alt="TTL"
          width={28}
          height={28}
          className="rounded-sm flex-shrink-0"
        />
        <span className="text-sm font-serif font-semibold text-ink leading-tight">
          TTL Mail
        </span>
      </div>

      {/* Compose button */}
      <div className="px-3 pt-3 pb-2">
        <Link
          href="/compose"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-teal hover:bg-teal-strong text-cream rounded-card text-sm font-sans font-medium transition-colors"
        >
          <PenSquare size={14} strokeWidth={2} />
          Compose
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-card text-sm font-sans transition-colors ${
                item.active
                  ? 'bg-teal text-cream font-medium'
                  : 'text-ink-soft hover:bg-rule hover:text-ink'
              }`}
            >
              <Icon size={15} strokeWidth={1.75} className="flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
