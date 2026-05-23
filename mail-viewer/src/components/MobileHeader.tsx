'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PenSquare, ChevronDown, Inbox, Users, Trash2, X } from 'lucide-react';

interface MobileHeaderProps {
  username: string;
  fullName?: string;
  mailbox: string;
  tag?: string;
  trashView?: boolean;
}

export function MobileHeader({ username, fullName, mailbox, tag, trashView }: MobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = (fullName && fullName !== username) ? fullName : username;

  // Determine which mailbox is active for display
  const getMailboxLabel = () => {
    if (trashView) return 'Trash';
    if (tag) return `#${tag}`;
    if (mailbox === 'shared') return 'Shared';
    if (mailbox === username) return displayName ? `${displayName}'s` : 'Personal';
    return mailbox;
  };

  const navItems = [
    ...(username
      ? [{
          label: displayName ? `${displayName}'s inbox` : 'Personal',
          href: `/inbox?mailbox=${username}`,
          icon: Inbox,
          active: mailbox === username && !tag && !trashView
        }]
      : []),
    {
      label: 'Shared inbox',
      href: '/inbox?mailbox=shared',
      icon: Users,
      active: mailbox === 'shared' && !tag && !trashView
    },
    {
      label: 'Trash',
      href: `/inbox?mailbox=${encodeURIComponent(mailbox)}&trash=1`,
      icon: Trash2,
      active: !!trashView
    },
  ];

  return (
    <div className="sm:hidden flex-shrink-0">
      {/* Main header bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-rule bg-[#f0ede4]">
        {/* Mailbox selector button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-card text-sm font-serif font-semibold text-ink hover:bg-rule transition-colors min-w-0"
        >
          <span className="truncate">{getMailboxLabel()}</span>
          <ChevronDown size={14} strokeWidth={2} className={`flex-shrink-0 text-ink-soft transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Compose button - icon only on very small screens, full on larger */}
        <Link
          href="/compose"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-teal hover:bg-teal-strong text-cream rounded-card text-xs font-sans font-medium transition-colors flex-shrink-0"
          title="Compose new message"
        >
          <PenSquare size={14} strokeWidth={2} />
          <span className="hidden xs:inline">New</span>
        </Link>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-ink/20 z-40"
            onClick={() => setMenuOpen(false)}
          />
          {/* Menu */}
          <div className="absolute left-2 right-2 top-12 bg-cream border border-rule rounded-card shadow-lg z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule bg-[#f0ede4]">
              <span className="text-xs font-sans font-semibold text-ink-soft uppercase tracking-wide">Mailboxes</span>
              <button onClick={() => setMenuOpen(false)} className="text-ink-soft hover:text-ink">
                <X size={14} strokeWidth={2} />
              </button>
            </div>
            <nav className="py-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm font-sans transition-colors ${
                      item.active
                        ? 'bg-teal text-cream font-medium'
                        : 'text-ink hover:bg-[#f0ede4]'
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.75} className="flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
