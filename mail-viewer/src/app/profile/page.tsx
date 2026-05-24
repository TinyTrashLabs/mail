import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { ProfileClient } from '@/components/ProfileClient';

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin');

  const username = (session as { username?: string }).username ?? '';
  const fullName = (session as { fullName?: string }).fullName;
  const email = (session as { user?: { email?: string } }).user?.email ?? undefined;

  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <Sidebar username={username} fullName={fullName} email={email} mailbox={username} />
      <main className="flex-1 overflow-y-auto p-6 sm:p-10">
        <ProfileClient username={username} displayName={fullName || username} email={email} />
      </main>
    </div>
  );
}
