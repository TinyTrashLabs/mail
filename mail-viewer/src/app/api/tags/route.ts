import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { viewerHeaders } from '@/lib/mail-store';

const STORE_URL = process.env.MAIL_STORE_URL!;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const username = (session as { username?: string }).username ?? '';

  const mailbox = req.nextUrl.searchParams.get('mailbox') || 'shared';
  const resp = await fetch(`${STORE_URL}/tags?mailbox=${encodeURIComponent(mailbox)}`, {
    headers: viewerHeaders(username),
    cache: 'no-store',
  });
  if (!resp.ok) return NextResponse.json({ error: 'store error' }, { status: 502 });
  return NextResponse.json(await resp.json());
}

// PATCH /api/tags?mailbox=...  { from, to }  — rename a tag across a mailbox.
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const username = (session as { username?: string }).username ?? '';

  const mailbox = req.nextUrl.searchParams.get('mailbox') || 'shared';
  const body = await req.json().catch(() => null);
  if (!body || typeof body.from !== 'string' || typeof body.to !== 'string') {
    return NextResponse.json({ error: 'from/to required' }, { status: 400 });
  }
  const resp = await fetch(`${STORE_URL}/tags?mailbox=${encodeURIComponent(mailbox)}`, {
    method: 'PATCH',
    headers: viewerHeaders(username, 'application/json'),
    body: JSON.stringify({ from: body.from, to: body.to }),
    cache: 'no-store',
  });
  const json = await resp.json().catch(() => ({}));
  return NextResponse.json(json, { status: resp.status });
}

// DELETE /api/tags?mailbox=...&tag=...
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const username = (session as { username?: string }).username ?? '';

  const mailbox = req.nextUrl.searchParams.get('mailbox') || 'shared';
  const tag = req.nextUrl.searchParams.get('tag') || '';
  if (!tag) return NextResponse.json({ error: 'tag required' }, { status: 400 });

  const url = `${STORE_URL}/tags?mailbox=${encodeURIComponent(mailbox)}&tag=${encodeURIComponent(tag)}`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: viewerHeaders(username),
    cache: 'no-store',
  });
  const json = await resp.json().catch(() => ({}));
  return NextResponse.json(json, { status: resp.status });
}
