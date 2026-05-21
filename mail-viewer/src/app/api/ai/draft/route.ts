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

  const { to, subject, context, tone = 'professional' } = await req.json();
  if (!subject) return NextResponse.json({ error: 'subject required' }, { status: 400 });

  const username = (session as { username?: string }).username ?? '';

  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Draft a ${tone} email reply or message. Return only the email body — no subject line, no "From:" header, no sign-off unless natural.

From: ${username}@tinytrashlabs.com
To: ${to || '(recipient)'}
Subject: ${subject}
${context ? `\nContext / instructions: ${context}` : ''}

Write the email body:`,
      },
    ],
  });

  const draft = message.content[0].type === 'text' ? message.content[0].text : '';
  return NextResponse.json({ draft });
}
