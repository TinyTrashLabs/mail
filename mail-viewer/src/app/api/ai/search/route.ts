import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessages } from '@/lib/mail-store';
import { getAIClient, AI_MODEL } from '@/lib/ai';

const MAX_QUERY_LENGTH = 500;

// Valid mailboxes a user can search — prevents IDOR via arbitrary mailbox param
function allowedMailboxes(username: string): string[] {
  return [username, 'shared'];
}

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

  // Build a compact index for Claude to reason over
  const index = data.messages
    .map((m, i) =>
      `[${i}] id=${m.id} from="${m.from_addr}" subject="${m.subject}" date="${m.received_at.slice(0, 10)}"`
    )
    .join('\n');

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

  let parsed: { indices?: number[]; explanation?: string } = {};
  try {
    // Strip markdown code fences if Claude wrapped it
    const clean = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    return NextResponse.json({ results: [], explanation: 'Could not parse AI response.' });
  }

  const indices = (parsed.indices || []).filter(
    (i): i is number => typeof i === 'number' && i >= 0 && i < data.messages.length
  );

  const results = indices.map((i) => data.messages[i]);
  return NextResponse.json({ results, explanation: parsed.explanation || '' });
}
