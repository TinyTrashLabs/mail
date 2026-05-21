import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAIClient, AI_MODEL } from '@/lib/ai';
import { checkRateLimit } from '@/lib/ai-rate-limit';

const MAX_CONTEXT_LENGTH = 1000;
const MAX_SUBJECT_LENGTH = 500;
const VALID_TONES = ['professional', 'friendly', 'concise'] as const;
type Tone = typeof VALID_TONES[number];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const username = (session as { username?: string }).username ?? '';
  const rl = checkRateLimit(username);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60000) / 1000)) } }
    );
  }

  const client = getAIClient();
  if (!client) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

  const body = await req.json();
  const to: string = typeof body.to === 'string' ? body.to.slice(0, 200) : '';
  const subject: string = typeof body.subject === 'string' ? body.subject.slice(0, MAX_SUBJECT_LENGTH) : '';
  const context: string = typeof body.context === 'string' ? body.context.slice(0, MAX_CONTEXT_LENGTH) : '';
  const tone: Tone = VALID_TONES.includes(body.tone) ? body.tone : 'professional';

  if (!subject) return NextResponse.json({ error: 'subject required' }, { status: 400 });

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          // Delimit untrusted user-provided context to reduce prompt injection surface
          content: `Draft a ${tone} email body. Return only the email body text — no subject line, no "From:" header.

<email_metadata>
From: ${username} (TTL team)
To: ${to || '(recipient)'}
Subject: ${subject}
</email_metadata>
${context ? `<instructions>\n${context}\n</instructions>` : ''}

Write the email body:`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
    }
    return NextResponse.json({ draft: textBlock.text });
  } catch (err) {
    console.error('[ai/draft] error:', err);
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
  }
}
