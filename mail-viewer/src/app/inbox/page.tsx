import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessages, fetchMessageStates, fetchMessage } from '@/lib/mail-store';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { AISearchBar } from '@/components/AISearchBar';
import { InboxClient } from '@/components/InboxClient';
import sanitizeHtml from 'sanitize-html';
import { stripHtml } from '@/lib/ai-utils';

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { mailbox?: string; page?: string; msg?: string; tag?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin');

  const username = (session as { username?: string }).username ?? '';
  const mailbox = searchParams.mailbox || username || 'shared';
  const page = parseInt(searchParams.page || '1');
  const tag = searchParams.tag || undefined;

  const data = await fetchMessages(mailbox, username, page, 50, tag).catch(() => ({
    messages: [], total: 0, page: 1, limit: 50,
  }));

  const totalPages = Math.ceil(data.total / data.limit) || 1;
  const ids = data.messages.map((m) => m.id);
  const initialStates = await fetchMessageStates(ids, username).catch(() => ({}));

  // If ?msg=<id> is in URL, pre-fetch the message for the reading pane
  let selectedMsg: Awaited<ReturnType<typeof fetchMessage>> | null = null;
  let selectedSafeHtml: string | null = null;
  if (searchParams.msg) {
    try {
      selectedMsg = await fetchMessage(searchParams.msg, username);
      if (selectedMsg.html_body) {
        selectedSafeHtml = sanitizeHtml(selectedMsg.html_body, {
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
          transformTags: {
            a: (_tagName, attribs) => ({
              tagName: 'a',
              attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
            }),
          },
        });
      }
    } catch {
      // message not found or forbidden — ignore, show empty pane
    }
  }

  const bodyForAI = selectedMsg
    ? (selectedMsg.text_body || (selectedSafeHtml ? stripHtml(selectedSafeHtml) : ''))
    : '';

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar username={username} mailbox={mailbox} tag={tag} />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="px-4 pt-3 pb-0 border-b border-rule bg-cream flex-shrink-0">
          <AISearchBar mailbox={mailbox} />
        </div>

        <InboxClient
          messages={data.messages}
          initialStates={initialStates}
          mailbox={mailbox}
          total={data.total}
          page={page}
          totalPages={totalPages}
          tag={tag}
          selectedMsgId={searchParams.msg ? parseInt(searchParams.msg) : null}
          selectedMsg={selectedMsg}
          selectedSafeHtml={selectedSafeHtml}
          bodyForAI={bodyForAI}
          username={username}
        />
      </main>
    </div>
  );
}
