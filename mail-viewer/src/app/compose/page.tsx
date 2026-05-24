import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { MobileHeader } from '@/components/MobileHeader';
import { ComposeForm } from '@/components/ComposeForm';

export default async function ComposePage({
  searchParams,
}: {
  searchParams: { replyTo?: string; subject?: string; inReplyTo?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin');

  const username = (session as { username?: string }).username ?? '';

  return (
    <div className="flex flex-col sm:flex-row h-screen overflow-hidden">
      <Sidebar username={username} mailbox="" />
      <MobileHeader username={username} mailbox={username} />
      <ComposeForm
        defaultTo={searchParams.replyTo || ''}
        defaultSubject={searchParams.subject || ''}
        defaultInReplyTo={searchParams.inReplyTo || ''}
      />
    </div>
  );
}
