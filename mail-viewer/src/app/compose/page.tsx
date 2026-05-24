import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { MobileHeader } from '@/components/MobileHeader';
import { ComposeForm } from '@/components/ComposeForm';

export default async function ComposePage({
  searchParams,
}: {
  searchParams: { replyTo?: string; subject?: string; inReplyTo?: string; popup?: string; draftId?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin');

  const username = (session as { username?: string }).username ?? '';
  const isPopup = searchParams.popup === '1';

  // Popup mode: no sidebar, no mobile header — just the compose form in a clean window
  if (isPopup) {
    return (
      <div className="h-screen overflow-hidden bg-cream">
        <ComposeForm
          defaultTo={searchParams.replyTo || ''}
          defaultSubject={searchParams.subject || ''}
          defaultInReplyTo={searchParams.inReplyTo || ''}
          draftId={searchParams.draftId ? parseInt(searchParams.draftId, 10) : undefined}
          popup
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row h-screen overflow-hidden">
      <Sidebar username={username} mailbox="" />
      <MobileHeader username={username} mailbox={username} />
      <ComposeForm
        defaultTo={searchParams.replyTo || ''}
        defaultSubject={searchParams.subject || ''}
        defaultInReplyTo={searchParams.inReplyTo || ''}
        draftId={searchParams.draftId ? parseInt(searchParams.draftId, 10) : undefined}
      />
    </div>
  );
}
