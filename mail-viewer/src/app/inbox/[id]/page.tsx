import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessage, MailStoreError } from '@/lib/mail-store';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { HtmlBody } from '@/components/HtmlBody';

export default async function MessagePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { mailbox?: string };
}) {
  // Fix: check session here, not just in middleware — server component must validate ownership
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin');

  const username = (session as { username?: string }).username ?? '';
  const mailbox = searchParams.mailbox || 'shared';

  let msg;
  try {
    // Pass username so mail-store enforces ownership — 403 if wrong user
    msg = await fetchMessage(params.id, username);
  } catch (err) {
    if (err instanceof MailStoreError && (err.status === 403 || err.status === 404)) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="flex h-screen">
      <aside className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col p-4 gap-1">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          TTL Mail
        </div>
        <Link href={`/inbox?mailbox=${mailbox}`} className="text-sm text-gray-300 hover:text-white">
          ← Back
        </Link>
      </aside>

      <main className="flex-1 overflow-y-auto p-8 max-w-3xl">
        <h1 className="text-xl font-semibold mb-4">{msg.subject}</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm mb-6">
          <dt className="font-medium text-gray-400">From</dt>
          <dd className="text-gray-200">{msg.from_addr}</dd>
          <dt className="font-medium text-gray-400">To</dt>
          <dd className="text-gray-200">{msg.to_addrs.map((a) => a.address).join(', ')}</dd>
          {msg.cc_addrs.length > 0 && (
            <>
              <dt className="font-medium text-gray-400">CC</dt>
              <dd className="text-gray-200">{msg.cc_addrs.map((a) => a.address).join(', ')}</dd>
            </>
          )}
          <dt className="font-medium text-gray-400">Date</dt>
          <dd className="text-gray-200">{new Date(msg.received_at).toLocaleString()}</dd>
        </dl>

        <div className="border-t border-gray-800 pt-6">
          {msg.text_body ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-200 leading-relaxed">
              {msg.text_body}
            </pre>
          ) : msg.html_body ? (
            <HtmlBody html={msg.html_body} />
          ) : (
            <p className="text-gray-500 italic text-sm">No body content.</p>
          )}
        </div>

        {msg.attachments_meta.length > 0 && (
          <div className="mt-6 border-t border-gray-800 pt-4">
            <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Attachments</div>
            <ul className="space-y-1">
              {msg.attachments_meta.map((a, i) => (
                <li key={i} className="text-sm text-gray-300">
                  {a.filename}{' '}
                  <span className="text-gray-500">({a.contentType}, {a.size} bytes)</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <Link
            href={`/compose?replyTo=${encodeURIComponent(msg.from_addr)}&subject=${encodeURIComponent(`Re: ${msg.subject}`)}&inReplyTo=${encodeURIComponent(msg.message_id || '')}`}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
          >
            Reply
          </Link>
          <Link
            href={`/inbox?mailbox=${mailbox}`}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm"
          >
            Back
          </Link>
        </div>
      </main>
    </div>
  );
}
