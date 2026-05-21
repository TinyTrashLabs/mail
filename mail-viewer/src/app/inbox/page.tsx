import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessages } from '@/lib/mail-store';
import Link from 'next/link';
import { redirect } from 'next/navigation';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
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

  return (
    <div className="flex h-screen">
      <aside className="w-48 bg-[#f0ede4] border-r border-rule flex flex-col p-4 gap-1">
        <div className="text-xs font-sans font-semibold text-ink-soft uppercase tracking-wider mb-3">
          TTL Mail
        </div>
        <Link
          href={`/inbox?mailbox=${username}`}
          className={`px-3 py-2 rounded-card text-sm font-sans ${
            mailbox === username
              ? 'bg-teal text-cream font-medium'
              : 'text-ink-soft hover:bg-rule'
          }`}
        >
          {username}@
        </Link>
        <Link
          href="/inbox?mailbox=shared"
          className={`px-3 py-2 rounded-card text-sm font-sans ${
            mailbox === 'shared'
              ? 'bg-teal text-cream font-medium'
              : 'text-ink-soft hover:bg-rule'
          }`}
        >
          shared
        </Link>
        <div className="mt-auto">
          <Link
            href="/compose"
            className="block w-full text-center px-3 py-2 bg-teal hover:bg-teal-strong text-cream rounded-card text-sm font-sans font-medium transition-colors"
          >
            Compose
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="divide-y divide-rule">
          {data.messages.length === 0 && (
            <div className="p-12 text-ink-soft text-center text-sm font-sans">No messages.</div>
          )}
          {data.messages.map((msg) => (
            <Link
              key={msg.id}
              href={`/inbox/${msg.id}?mailbox=${mailbox}`}
              className="flex items-start gap-4 px-6 py-4 hover:bg-[#f0ede4] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-teal-strong flex items-center justify-center text-sm font-bold text-cream flex-shrink-0">
                {(msg.from_addr[0] || '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-ink truncate text-sm">{msg.from_addr}</span>
                  <span className="text-xs text-ink-soft flex-shrink-0 font-sans">{formatDate(msg.received_at)}</span>
                </div>
                <div className="text-sm text-ink-soft font-sans truncate">{msg.subject}</div>
              </div>
            </Link>
          ))}
        </div>

        {data.total > data.limit && (
          <div className="flex justify-center items-center gap-4 p-4 text-sm font-sans">
            {page > 1 && (
              <Link href={`/inbox?mailbox=${mailbox}&page=${page - 1}`} className="text-teal-strong hover:underline">
                ← Prev
              </Link>
            )}
            <span className="text-ink-soft">{page} / {Math.ceil(data.total / data.limit)}</span>
            {page < Math.ceil(data.total / data.limit) && (
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
