import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessages } from '@/lib/mail-store';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { AISearchBar } from '@/components/AISearchBar';
import { Paperclip, Star } from 'lucide-react';

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

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { mailbox?: string; page?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin');

  const username = (session as { username?: string }).username ?? '';
  const mailbox = searchParams.mailbox || username || 'shared';
  const page = parseInt(searchParams.page || '1');

  const data = await fetchMessages(mailbox, username, page).catch(() => ({
    messages: [], total: 0, page: 1, limit: 50,
  }));

  const totalPages = Math.ceil(data.total / data.limit) || 1;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar username={username} mailbox={mailbox} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="px-6 pt-3 pb-2 border-b border-rule bg-cream flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-sans font-semibold text-ink capitalize">{mailbox}</h1>
            <span className="text-xs text-ink-soft font-sans">
              {data.total} {data.total === 1 ? 'message' : 'messages'}
            </span>
          </div>
          <AISearchBar mailbox={mailbox} />
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto divide-y divide-rule">
          {data.messages.length === 0 && (
            <div className="p-12 text-ink-soft text-center text-sm font-sans">No messages.</div>
          )}
          {data.messages.map((msg) => (
            <Link
              key={msg.id}
              href={`/inbox/${msg.id}?mailbox=${mailbox}`}
              className="flex items-center gap-3 px-6 py-3 hover:bg-[#f0ede4] transition-colors group"
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full ${avatarColor(msg.from_addr)} flex items-center justify-center text-xs font-bold text-cream flex-shrink-0`}
              >
                {avatarInitial(msg.from_addr)}
              </div>

              {/* Star placeholder — click to star (future) */}
              <Star
                size={13}
                strokeWidth={1.5}
                className="flex-shrink-0 text-rule group-hover:text-ink-soft transition-colors"
              />

              {/* Content */}
              <div className="flex-1 min-w-0 grid grid-cols-[10rem_1fr_auto] items-baseline gap-2">
                <span className="text-sm font-medium text-ink truncate">{msg.from_addr.split('@')[0]}</span>
                <span className="text-sm text-ink-soft font-sans truncate">{msg.subject}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {msg.attachments_meta?.length > 0 && (
                    <Paperclip size={12} className="text-ink-soft" strokeWidth={1.75} />
                  )}
                  <span className="text-xs text-ink-soft font-sans whitespace-nowrap">
                    {formatDate(msg.received_at)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
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
      </main>
    </div>
  );
}
