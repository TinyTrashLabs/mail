import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';
import sanitizeHtml from 'sanitize-html';

// Sanitize outbound HTML. Strips script/style/onevent attributes etc.
// Keeps common formatting/styling that compose tray actually emits.
function safeOutboundHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img', 'h1', 'h2', 'h3', 'span', 'u', 's',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['style', 'class'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
  });
}

const FROM_DOMAIN = process.env.RESEND_FROM_DOMAIN || 'tinytrashlabs.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MSGID_SAFE_RE = /^[^\r\n\x00]*$/;

function parseEmailList(val: string | string[] | null): string[] {
  if (!val) return [];
  const raw = Array.isArray(val) ? val : [val];
  return raw.flatMap(v => v.split(',').map(s => s.trim())).filter(Boolean);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const username = (session as { username?: string }).username ?? '';
  if (!username) {
    return NextResponse.json({ error: 'forbidden: no username in session' }, { status: 403 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'mail sending not configured' }, { status: 503 });
  }

  const contentType = req.headers.get('content-type') || '';
  let to: string[], subject: string, bodyText: string, bodyHtml: string | undefined;
  let cc: string[], bcc: string[], inReplyTo: string | undefined, references: string | undefined;
  let attachmentFiles: { filename: string; content: Buffer; contentType: string }[] = [];

  if (contentType.includes('multipart/form-data')) {
    // Attachment path
    const form = await req.formData();
    to = parseEmailList(form.getAll('to') as string[]);
    cc = parseEmailList(form.getAll('cc') as string[]);
    bcc = parseEmailList(form.getAll('bcc') as string[]);
    subject = String(form.get('subject') || '');
    bodyText = String(form.get('body') || '');
    bodyHtml = form.has('html') ? String(form.get('html')) : undefined;
    inReplyTo = form.has('inReplyTo') ? String(form.get('inReplyTo')) : undefined;

    const files = form.getAll('attachments') as File[];
    if (files.length > 10) {
      return NextResponse.json({ error: 'too many attachments (max 10)' }, { status: 400 });
    }
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'attachments too large (max 25 MB total)' }, { status: 400 });
    }
    attachmentFiles = await Promise.all(
      files.map(async (f) => ({
        filename: f.name,
        content: Buffer.from(await f.arrayBuffer()),
        contentType: f.type || 'application/octet-stream',
      }))
    );
  } else {
    const json = await req.json();
    to = parseEmailList(json.to);
    cc = parseEmailList(json.cc);
    bcc = parseEmailList(json.bcc);
    subject = String(json.subject || '');
    bodyText = String(json.body || '');
    bodyHtml = json.html ? String(json.html) : undefined;
    inReplyTo = json.inReplyTo ? String(json.inReplyTo) : undefined;
    references = json.references ? String(json.references) : undefined;
  }

  if (!to.length || !subject || !bodyText) {
    return NextResponse.json({ error: 'to, subject, body required' }, { status: 400 });
  }
  if (!to.every(addr => EMAIL_RE.test(addr))) {
    return NextResponse.json({ error: 'invalid to address' }, { status: 400 });
  }
  if (cc.length && !cc.every(addr => EMAIL_RE.test(addr))) {
    return NextResponse.json({ error: 'invalid cc address' }, { status: 400 });
  }
  if (bcc.length && !bcc.every(addr => EMAIL_RE.test(addr))) {
    return NextResponse.json({ error: 'invalid bcc address' }, { status: 400 });
  }
  if (inReplyTo && !MSGID_SAFE_RE.test(inReplyTo)) {
    return NextResponse.json({ error: 'invalid inReplyTo' }, { status: 400 });
  }
  if (references && !MSGID_SAFE_RE.test(references)) {
    return NextResponse.json({ error: 'invalid references' }, { status: 400 });
  }

  const from = `${username}@${FROM_DOMAIN}`;
  const extraHeaders: Record<string, string> = {};
  if (inReplyTo) extraHeaders['In-Reply-To'] = inReplyTo;
  if (references) extraHeaders['References'] = references;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from,
    to,
    ...(cc.length ? { cc } : {}),
    ...(bcc.length ? { bcc } : {}),
    subject,
    text: bodyText,
    ...(bodyHtml ? { html: safeOutboundHtml(bodyHtml) } : {}),
    ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
    ...(attachmentFiles.length ? {
      attachments: attachmentFiles.map(f => ({
        filename: f.filename,
        content: f.content,
      })),
    } : {}),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ id: data?.id });
}
