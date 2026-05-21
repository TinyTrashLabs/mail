import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessages, fetchMessageStates } from '@/lib/mail-store';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { AISearchBar } from '@/components/AISearchBar';
import { InboxClient } from '@/components/InboxClient';

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

  // Fetch read/starred state for all messages on this page
  const ids = data.messages.map((m) => m.id);
  const initialStates = await fetchMessageStates(ids, username).catch(() => ({}));

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar username={username} mailbox={mailbox} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* AI Search bar — server-rendered above the interactive list */}
        <div className="px-6 pt-3 pb-0 border-b border-rule bg-cream flex-shrink-0">
          <AISearchBar mailbox={mailbox} />
        </div>

        <InboxClient
          messages={data.messages}
          initialStates={initialStates}
          mailbox={mailbox}
          total={data.total}
          page={page}
          totalPages={totalPages}
        />
      </main>
    </div>
  );
}
