import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

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

  // Validate `to` — must be a single RFC5322-ish email or array of them.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const toList = Array.isArray(to) ? to : [to];
  if (toList.length === 0 || !toList.every((addr) => typeof addr === 'string' && EMAIL_RE.test(addr))) {
    return NextResponse.json({ error: 'invalid to address' }, { status: 400 });
  }

  // Validate inReplyTo / references — must look like a Message-ID (<...@...>).
  // Reject anything with CR, LF, or NUL to prevent header injection.
  const MSGID_SAFE_RE = /^[^\r\n\x00]*$/;
  if (inReplyTo && !MSGID_SAFE_RE.test(inReplyTo)) {
    return NextResponse.json({ error: 'invalid inReplyTo' }, { status: 400 });
  }
  if (references && !MSGID_SAFE_RE.test(references)) {
    return NextResponse.json({ error: 'invalid references' }, { status: 400 });
  }

  // from address is always derived from the authenticated session — never from the request body
  const from = `${username}@${FROM_DOMAIN}`;

  const extraHeaders: Record<string, string> = {};
  if (inReplyTo) extraHeaders['In-Reply-To'] = inReplyTo;
  if (references) extraHeaders['References'] = references;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'mail sending not configured' }, { status: 503 });
  }
  // Instantiate Resend lazily inside the handler so the module can be imported
  // during Next.js build without requiring RESEND_API_KEY at build time.
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from,
    to: toList,
    subject,
    text: body,
    ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ id: data?.id });
}
