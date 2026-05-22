import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessage, fetchMessageStates, MailStoreError } from '@/lib/mail-store';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import sanitizeHtml from 'sanitize-html';
import { Sidebar } from '@/components/Sidebar';
import { AISummary } from '@/components/AISummary';
import { MessageActions } from '@/components/MessageActions';
import { stripHtml } from '@/lib/ai-utils';
import {
  ArrowLeft,
  Reply,
  Forward,
  Paperclip,
} from 'lucide-react';

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

  // Plain text body for AI summary (prefer text_body, fall back to stripped HTML)
  const bodyForAI = msg.text_body || (safeHtml ? stripHtml(safeHtml) : '');

  // Fetch initial star state (best-effort — falls back to unstarred)
  const stateMap = username
    ? await fetchMessageStates([msg.id], username).catch((): import('@/lib/mail-store').StateMap => ({}))
    : ({} as import('@/lib/mail-store').StateMap);
  const initialStarred = stateMap[String(msg.id)]?.is_starred ?? false;
  const initialRead = stateMap[String(msg.id)]?.is_read ?? false;

  const replyHref = `/compose?replyTo=${encodeURIComponent(msg.from_addr)}&subject=${encodeURIComponent(`Re: ${msg.subject}`)}&inReplyTo=${encodeURIComponent(msg.message_id || '')}`;
  const backHref = `/inbox?mailbox=${mailbox}`;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar username={username} mailbox={mailbox} />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-rule bg-cream flex-shrink-0">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm font-sans text-ink-soft hover:text-ink transition-colors mr-2"
          >
            <ArrowLeft size={15} strokeWidth={1.75} />
            Back
          </Link>
          <MessageActions
            messageId={msg.id}
            initialStarred={initialStarred}
            initialRead={initialRead}
            replyHref={replyHref}
            backHref={backHref}
          />
        </div>

        {/* Message content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-8">
            {/* Subject */}
            <h1 className="text-xl font-serif font-semibold text-ink mb-6 leading-snug">
              {msg.subject}
            </h1>

            {/* AI Summary — only shown when body is available */}
            {bodyForAI && (
              <AISummary
                messageId={msg.id}
                subject={msg.subject}
                from={msg.from_addr}
                body={bodyForAI}
              />
            )}

            {/* Header card */}
            <div className="bg-[#f0ede4] rounded-card p-4 mb-6">
              <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5 text-sm font-sans">
                <dt className="font-medium text-ink-soft">From</dt>
                <dd className="text-ink break-all">{msg.from_addr}</dd>
                <dt className="font-medium text-ink-soft">To</dt>
                <dd className="text-ink break-all">{msg.to_addrs.map((a) => a.address).join(', ')}</dd>
                {msg.cc_addrs.length > 0 && (
                  <>
                    <dt className="font-medium text-ink-soft">CC</dt>
                    <dd className="text-ink break-all">{msg.cc_addrs.map((a) => a.address).join(', ')}</dd>
                  </>
                )}
                <dt className="font-medium text-ink-soft">Date</dt>
                <dd className="text-ink">{new Date(msg.received_at).toLocaleString()}</dd>
              </dl>
            </div>

            {/* Body — prefer rich HTML when present (multipart/alternative),
                fall back to text_body, then to "no body content" placeholder.
                Modern mail clients (Gmail, Outlook, Thunderbird) all default to
                the HTML alternative; the text part is the legacy fallback. */}
            <div className="border-t border-rule pt-6">
              {safeHtml ? (
                <div
                  className="prose max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: safeHtml }}
                />
              ) : msg.text_body ? (
                <pre className="whitespace-pre-wrap font-mono text-sm text-ink leading-relaxed">
                  {msg.text_body}
                </pre>
              ) : (
                <p className="text-ink-soft italic text-sm font-sans">No body content.</p>
              )}
            </div>

            {/* Attachments */}
            {msg.attachments_meta.length > 0 && (
              <div className="mt-8 border-t border-rule pt-5">
                <div className="flex items-center gap-1.5 text-xs font-sans font-semibold text-ink-soft uppercase tracking-wider mb-3">
                  <Paperclip size={12} strokeWidth={2} />
                  Attachments ({msg.attachments_meta.length})
                </div>
                <ul className="space-y-1.5">
                  {msg.attachments_meta.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm font-sans">
                      <Paperclip size={13} strokeWidth={1.75} className="text-ink-soft flex-shrink-0" />
                      <span className="text-ink">{a.filename}</span>
                      <span className="text-ink-soft text-xs">({a.contentType}, {a.size} bytes)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reply/Forward actions */}
            <div className="mt-8 pt-6 border-t border-rule flex gap-3">
              <Link
                href={replyHref}
                className="flex items-center gap-2 px-4 py-2 bg-teal hover:bg-teal-strong text-cream rounded-card text-sm font-sans font-medium transition-colors"
              >
                <Reply size={14} strokeWidth={2} />
                Reply
              </Link>
              <Link
                href={`/compose?subject=${encodeURIComponent(`Fwd: ${msg.subject}`)}`}
                className="flex items-center gap-2 px-4 py-2 bg-rule hover:bg-[#d8d4cb] text-ink rounded-card text-sm font-sans transition-colors"
              >
                <Forward size={14} strokeWidth={2} />
                Forward
              </Link>
              <Link
                href={backHref}
                className="ml-auto px-4 py-2 text-sm font-sans text-ink-soft hover:text-ink transition-colors"
              >
                Back
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
