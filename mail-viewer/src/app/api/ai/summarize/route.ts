import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAIClient, AI_MODEL } from '@/lib/ai';

const MAX_BODY_LENGTH = 4000;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = getAIClient();
  if (!client) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
  }

  const body = await req.json();
  const subject: string = typeof body.subject === 'string' ? body.subject.slice(0, 500) : '';
  const from: string = typeof body.from === 'string' ? body.from.slice(0, 200) : '';
  const emailBody: string = typeof body.body === 'string' ? body.body.slice(0, MAX_BODY_LENGTH) : '';

  if (!emailBody) return NextResponse.json({ error: 'body required' }, { status: 400 });

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Summarize this email in 2-3 sentences. Be concise and direct.

From: ${from}
Subject: ${subject}
---
${emailBody}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
    }

    return NextResponse.json({ summary: textBlock.text });
  } catch (err) {
    console.error('[ai/summarize] error:', err);
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
  }
}
