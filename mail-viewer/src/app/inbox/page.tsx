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
      <aside className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col p-4 gap-1">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          TTL Mail
        </div>
        <Link
          href={`/inbox?mailbox=${username}`}
          className={`px-3 py-2 rounded text-sm ${
            mailbox === username ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          {username}@
        </Link>
        <Link
          href="/inbox?mailbox=shared"
          className={`px-3 py-2 rounded text-sm ${
            mailbox === 'shared' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          shared
        </Link>
        <div className="mt-auto">
          <Link
            href="/compose"
            className="block w-full text-center px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
          >
            Compose
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="divide-y divide-gray-800">
          {data.messages.length === 0 && (
            <div className="p-12 text-gray-500 text-center text-sm">No messages.</div>
          )}
          {data.messages.map((msg) => (
            <Link
              key={msg.id}
              href={`/inbox/${msg.id}?mailbox=${mailbox}`}
              className="flex items-start gap-4 px-6 py-4 hover:bg-gray-900 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {(msg.from_addr[0] || '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-100 truncate text-sm">{msg.from_addr}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">{formatDate(msg.received_at)}</span>
                </div>
                <div className="text-sm text-gray-400 truncate">{msg.subject}</div>
              </div>
            </Link>
          ))}
        </div>

        {data.total > data.limit && (
          <div className="flex justify-center items-center gap-4 p-4 text-sm">
            {page > 1 && (
              <Link href={`/inbox?mailbox=${mailbox}&page=${page - 1}`} className="text-blue-400 hover:underline">
                ← Prev
              </Link>
            )}
            <span className="text-gray-500">{page} / {Math.ceil(data.total / data.limit)}</span>
            {page < Math.ceil(data.total / data.limit) && (
              <Link href={`/inbox?mailbox=${mailbox}&page=${page + 1}`} className="text-blue-400 hover:underline">
                Next →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
