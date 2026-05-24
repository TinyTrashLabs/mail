'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { PenSquare, ChevronDown, Inbox, Users, Trash2, X, Tag, Menu, LogOut } from 'lucide-react';

interface MobileHeaderProps {
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

export function MobileHeader({ username, fullName, mailbox, tag, trashView }: MobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tags, setTags] = useState<TagRow[]>([]);
  const displayName = (fullName && fullName !== username) ? fullName : username;

  // For Trash link, use the base mailbox (personal or shared), not a tag-filtered view
  const baseMailbox = mailbox === 'shared' ? 'shared' : username || 'shared';

  // Load tags for the current mailbox (same as desktop sidebar)
  useEffect(() => {
    let cancel = false;
    fetch(`/api/tags?mailbox=${encodeURIComponent(mailbox)}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows) => {
        if (cancel || !Array.isArray(rows)) return;
        setTags(rows.slice(0, 12));
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [mailbox]);

  // Determine which mailbox/context is active for display in the header bar
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
      href: `/inbox?mailbox=${encodeURIComponent(baseMailbox)}&trash=1`,
      icon: Trash2,
      active: !!trashView
    },
  ];

  return (
    <div className="sm:hidden flex-shrink-0 relative">
      {/* Main header bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-rule bg-[#f0ede4]">
        {/* Hamburger + current context label */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-card text-sm font-serif font-semibold text-ink hover:bg-rule transition-colors min-w-0"
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
        >
          <Menu size={16} strokeWidth={2} className="flex-shrink-0 text-ink-soft" />
          <span className="truncate">{getMailboxLabel()}</span>
          <ChevronDown size={14} strokeWidth={2} className={`flex-shrink-0 text-ink-soft transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Compose button */}
        <Link
          href="/compose"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-teal hover:bg-teal-strong text-cream rounded-card text-xs font-sans font-medium transition-colors flex-shrink-0"
          title="Compose new message"
        >
          <PenSquare size={14} strokeWidth={2} />
          <span className="hidden xs:inline">New</span>
        </Link>
      </div>

      {/* Full-navigation drawer */}
      {menuOpen && (
        <>
          {/* Backdrop — pointer-events-auto ensures clicks always register */}
          <div
            className="fixed inset-0 bg-ink/20 z-40 pointer-events-auto"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          {/* Menu panel */}
          <div
            className="absolute left-0 right-0 top-full mt-1 mx-2 bg-cream border border-rule rounded-card shadow-lg z-50 overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule bg-[#f0ede4]">
              <span className="text-xs font-sans font-semibold text-ink-soft uppercase tracking-wide">Navigation</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center w-11 h-11 -mr-3 text-ink-soft hover:text-ink"
                aria-label="Close menu"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            {/* Mailboxes */}
            <div className="border-b border-rule pb-1 pt-1">
              <div className="px-4 pt-1 pb-0.5">
                <span className="text-[10px] font-sans font-semibold text-ink-soft/70 uppercase tracking-wide">Mailboxes</span>
              </div>
              <nav>
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

            {/* Sign out */}
            <div className="border-t border-rule pt-1 pb-1">
              <Link
                href="/api/auth/signout"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-sans text-ink-soft hover:text-ink hover:bg-[#f0ede4] transition-colors"
              >
                <LogOut size={16} strokeWidth={1.75} className="flex-shrink-0" />
                <span>Sign out</span>
              </Link>
            </div>

            {/* Tags */}
            <div className="pt-1 pb-2">
              <div className="flex items-center justify-between px-4 pt-1 pb-0.5">
                <div className="flex items-center gap-1.5">
                  <Tag size={11} strokeWidth={1.75} className="text-ink-soft" />
                  <span className="text-[10px] font-sans font-semibold text-ink-soft/70 uppercase tracking-wide">Tags</span>
                </div>
                <Link
                  href={`/inbox/tags?mailbox=${encodeURIComponent(mailbox)}`}
                  onClick={() => setMenuOpen(false)}
                  className="text-[10px] text-ink-soft hover:text-ink font-sans"
                >
                  manage
                </Link>
              </div>
              {tags.length === 0 ? (
                <div className="px-4 py-1.5 text-[11px] font-sans text-ink-soft/60 italic">No tags yet</div>
              ) : (
                <nav>
                  {tags.map(({ tag: t }) => (
                    <Link
                      key={t}
                      href={`/inbox?mailbox=${encodeURIComponent(mailbox)}&tag=${encodeURIComponent(t)}`}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2 text-sm font-sans transition-colors ${
                        tag === t
                          ? 'bg-teal text-cream font-medium'
                          : 'text-ink hover:bg-[#f0ede4]'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tagDot(t)}`} />
                      <span className="truncate">{t}</span>
                    </Link>
                  ))}
                </nav>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
