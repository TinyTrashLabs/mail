import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAIClient, AI_MODEL } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = getAIClient();
  if (!client) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
  }

  const { subject, from, body } = await req.json();
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

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
${body.slice(0, 4000)}`,
      },
    ],
  });

  const summary = message.content[0].type === 'text' ? message.content[0].text : '';
  return NextResponse.json({ summary });
}
