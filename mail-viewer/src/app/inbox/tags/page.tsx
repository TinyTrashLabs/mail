import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { TagManagementClient } from '@/components/TagManagementClient';
import { resolveMailbox } from '@/lib/mailbox';
import { viewerHeaders } from '@/lib/mail-store';

const STORE_URL = process.env.MAIL_STORE_URL!;

async function fetchTagsForMailbox(mailbox: string, viewerUser: string): Promise<Array<{ tag: string; count: number }>> {
  try {
    const resp = await fetch(`${STORE_URL}/tags?mailbox=${encodeURIComponent(mailbox)}`, {
      headers: viewerHeaders(viewerUser),
      cache: 'no-store',
    });
    if (!resp.ok) return [];
    const rows = await resp.json();
    return Array.isArray(rows) ? rows.map((r: { tag: string; count: number | string }) => ({
      tag: r.tag, count: typeof r.count === 'string' ? parseInt(r.count) : r.count,
    })) : [];
  } catch {
    return [];
  }
}

export default async function TagsPage({
  searchParams,
}: {
  searchParams: { mailbox?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin');

  const username = (session as { username?: string }).username ?? '';
  const mailbox = resolveMailbox(searchParams.mailbox, username);
  const fullName = (session as { user?: { name?: string } }).user?.name ?? username;
  const email = (session as { user?: { email?: string } }).user?.email ?? undefined;

  const tags = await fetchTagsForMailbox(mailbox, username);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar username={username} fullName={fullName} email={email} mailbox={mailbox} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-rule bg-cream">
          <h1 className="text-base font-serif font-semibold text-ink">Tag management</h1>
          <p className="text-xs font-sans text-ink-soft mt-1">
            Mailbox: <span className="font-medium">{mailbox}</span> · {tags.length} tag{tags.length === 1 ? '' : 's'}
          </p>
        </div>
        <TagManagementClient initialTags={tags} mailbox={mailbox} />
      </main>
    </div>
  );
}
