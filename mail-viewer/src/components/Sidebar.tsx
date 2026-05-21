'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  PenSquare,
  Star,
  Users,
} from 'lucide-react';

interface SidebarProps {
  username: string;
  mailbox: string;
}

export function Sidebar({ username, mailbox }: SidebarProps) {
  const pathname = usePathname();
  const isInbox = pathname.startsWith('/inbox');

  const navItems = [
    {
      label: username ? `${username}@` : 'Inbox',
      href: `/inbox?mailbox=${username}`,
      icon: Inbox,
      active: isInbox && mailbox === username,
    },
    {
      label: 'Shared',
      href: '/inbox?mailbox=shared',
      icon: Users,
      active: isInbox && mailbox === 'shared',
    },
    {
      label: 'Starred',
      href: '/inbox?mailbox=starred',
      icon: Star,
      active: isInbox && mailbox === 'starred',
    },
    {
      label: 'Sent',
      href: '/inbox?mailbox=sent',
      icon: Send,
      active: isInbox && mailbox === 'sent',
    },
    {
      label: 'Drafts',
      href: '/inbox?mailbox=drafts',
      icon: FileText,
      active: isInbox && mailbox === 'drafts',
    },
    {
      label: 'Trash',
      href: '/inbox?mailbox=trash',
      icon: Trash2,
      active: isInbox && mailbox === 'trash',
    },
  ];

  return (
    <aside className="w-52 bg-[#f0ede4] border-r border-rule flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-rule">
        <Image
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
