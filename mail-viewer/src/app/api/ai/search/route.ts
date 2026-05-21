import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessages } from '@/lib/mail-store';
import { getAIClient, AI_MODEL } from '@/lib/ai';
import { allowedMailboxes, parseAISearchResponse, filterIndices } from '@/lib/ai-utils';

const MAX_QUERY_LENGTH = 500;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = getAIClient();
  if (!client) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
  }

  const username = (session as { username?: string }).username ?? '';
  const body = await req.json();
  const query: string = typeof body.query === 'string' ? body.query.slice(0, MAX_QUERY_LENGTH) : '';
  if (!query.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 });

  // Authorization: only allow mailboxes this user can legitimately access
  const requestedMailbox: string = typeof body.mailbox === 'string' ? body.mailbox : username;
  if (!allowedMailboxes(username).includes(requestedMailbox)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch recent messages to search over (up to 100)
  const data = await fetchMessages(requestedMailbox, username, 1, 100).catch(() => ({
    messages: [], total: 0, page: 1, limit: 100,
  }));

  if (data.messages.length === 0) {
    return NextResponse.json({ results: [], explanation: 'No messages to search.' });
  }

  // Build a compact index — guard against null received_at
  const index = data.messages
    .map((m, i) => {
      const date = m.received_at ? m.received_at.slice(0, 10) : 'unknown';
      return `[${i}] id=${m.id} from="${m.from_addr}" subject="${m.subject}" date="${date}"`;
    })
    .join('\n');

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are a smart email search assistant. Given a natural-language query and a list of emails, return the indices of matching emails as a JSON array, plus a one-sentence explanation.

Query: "${query}"

Emails:
${index}

Respond ONLY with valid JSON in this exact shape:
{"indices": [0, 3, 7], "explanation": "Found 3 emails about invoices from Bob."}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const raw = textBlock?.type === 'text' ? textBlock.text.trim() : '';
    if (!raw) {
      return NextResponse.json({ results: [], explanation: 'No response from AI.' });
    }

    const parsed = parseAISearchResponse(raw);
    if (!parsed) {
      return NextResponse.json({ results: [], explanation: 'Could not parse AI response.' });
    }

    const indices = filterIndices(parsed.indices, data.messages.length);
    const results = indices.map((i) => data.messages[i]);
    return NextResponse.json({ results, explanation: parsed.explanation || '' });
  } catch (err) {
    console.error('[ai/search] error:', err);
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
  }
}
