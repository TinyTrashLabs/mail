import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listDrafts } from '@/lib/mail-store';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { MobileHeader } from '@/components/MobileHeader';
import { DraftsClient } from '@/components/DraftsClient';

export default async function DraftsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin');

  const username = (session as { username?: string }).username ?? '';
  const fullName = (session as { fullName?: string }).fullName;

  const { drafts } = await listDrafts(username).catch(() => ({ drafts: [] }));

  return (
    <div className="flex flex-col sm:flex-row h-screen overflow-hidden">
      <Sidebar username={username} fullName={fullName} mailbox={username} draftsView />
      <MobileHeader username={username} mailbox={username} />
      <DraftsClient drafts={drafts} />
    </div>
  );
}
