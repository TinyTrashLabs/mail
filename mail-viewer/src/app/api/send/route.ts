import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM_DOMAIN = process.env.RESEND_FROM_DOMAIN || 'tinytrashlabs.com';

/** Only these usernames may send as <name>@tinytrashlabs.com via Resend. */
const PERSONAL = new Set(['david', 'shane', 'derek', 'ryan']);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const username = (session as { username?: string }).username ?? '';

  // Fix: only PERSONAL members may send outbound; prevents from-address spoofing
  if (!PERSONAL.has(username)) {
    return NextResponse.json({ error: 'forbidden: not a personal mailbox user' }, { status: 403 });
  }

  const { to, subject, body, inReplyTo, references } = await req.json();

  if (!to || !subject || !body) {
    return NextResponse.json({ error: 'to, subject, body required' }, { status: 400 });
  }

  // from address is always derived from the authenticated session — never from the request body
  const from = `${username}@${FROM_DOMAIN}`;

  const extraHeaders: Record<string, string> = {};
  if (inReplyTo) extraHeaders['In-Reply-To'] = inReplyTo;
  if (references) extraHeaders['References'] = references;

  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    text: body,
    ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ id: data?.id });
}
