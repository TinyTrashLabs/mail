import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessage, MailStoreError } from '@/lib/mail-store';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import sanitizeHtml from 'sanitize-html';

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

  // Sanitize server-side with an allowlist tuned for HTML email.
  // sanitize-html is pure Node — no jsdom, no ESM conflicts.
  const safeHtml = msg.html_body
    ? sanitizeHtml(msg.html_body, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          'img', 'figure', 'figcaption', 'picture', 'source',
          'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
          'caption', 'colgroup', 'col',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'details', 'summary',
          'span', 'div', 'section', 'article', 'header', 'footer', 'main',
          'font', 'center',
        ]),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          '*': ['style', 'class', 'id', 'align', 'valign', 'bgcolor', 'width', 'height', 'border', 'cellpadding', 'cellspacing'],
          'a': ['href', 'target', 'rel', 'name'],
          'img': ['src', 'alt', 'title', 'width', 'height', 'style'],
          'td': ['colspan', 'rowspan'],
          'th': ['colspan', 'rowspan', 'scope'],
          'font': ['color', 'size', 'face'],
        },
        allowedSchemes: ['http', 'https', 'mailto', 'cid'],
        // Force target="_blank" rel on all links to prevent tab hijacking
        transformTags: {
          a: (_tagName, attribs) => ({
            tagName: 'a',
            attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
          }),
        },
      })
    : null;

  return (
    <div className="flex h-screen">
      <aside className="w-48 bg-[#f0ede4] border-r border-rule flex flex-col p-4 gap-1">
        <div className="text-xs font-sans font-semibold text-ink-soft uppercase tracking-wider mb-3">
          TTL Mail
        </div>
        <Link href={`/inbox?mailbox=${mailbox}`} className="text-sm font-sans text-ink-soft hover:text-ink">
          ← Back
        </Link>
      </aside>

      <main className="flex-1 overflow-y-auto p-8 max-w-3xl">
        <h1 className="text-xl font-semibold mb-4">{msg.subject}</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm mb-6 font-sans">
          <dt className="font-medium text-ink-soft">From</dt>
          <dd className="text-ink">{msg.from_addr}</dd>
          <dt className="font-medium text-ink-soft">To</dt>
          <dd className="text-ink">{msg.to_addrs.map((a) => a.address).join(', ')}</dd>
          {msg.cc_addrs.length > 0 && (
            <>
              <dt className="font-medium text-ink-soft">CC</dt>
              <dd className="text-ink">{msg.cc_addrs.map((a) => a.address).join(', ')}</dd>
            </>
          )}
          <dt className="font-medium text-ink-soft">Date</dt>
          <dd className="text-ink">{new Date(msg.received_at).toLocaleString()}</dd>
        </dl>

        <div className="border-t border-rule pt-6">
          {msg.text_body ? (
            <pre className="whitespace-pre-wrap font-mono text-sm text-ink leading-relaxed">
              {msg.text_body}
            </pre>
          ) : safeHtml ? (
            <div
              className="prose max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          ) : (
            <p className="text-ink-soft italic text-sm font-sans">No body content.</p>
          )}
        </div>

        {msg.attachments_meta.length > 0 && (
          <div className="mt-6 border-t border-rule pt-4">
            <div className="text-xs font-sans font-semibold text-ink-soft uppercase mb-2">Attachments</div>
            <ul className="space-y-1">
              {msg.attachments_meta.map((a, i) => (
                <li key={i} className="text-sm font-sans text-ink">
                  {a.filename}{' '}
                  <span className="text-ink-soft">({a.contentType}, {a.size} bytes)</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <Link
            href={`/compose?replyTo=${encodeURIComponent(msg.from_addr)}&subject=${encodeURIComponent(`Re: ${msg.subject}`)}&inReplyTo=${encodeURIComponent(msg.message_id || '')}`}
            className="px-4 py-2 bg-teal hover:bg-teal-strong text-cream rounded-card text-sm font-sans font-medium transition-colors"
          >
            Reply
          </Link>
          <Link
            href={`/inbox?mailbox=${mailbox}`}
            className="px-4 py-2 bg-rule hover:bg-[#d8d4cb] text-ink rounded-card text-sm font-sans transition-colors"
          >
            Back
          </Link>
        </div>
      </main>
    </div>
  );
}
