/**
 * Per-message tag management — POST adds, DELETE removes (via ?tag= query).
 * Both proxy to mail-store with a minted viewer token so access control
 * happens in one place.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { viewerHeaders } from '@/lib/mail-store';

const STORE_URL = process.env.MAIL_STORE_URL!;
const TAG_RE = /^[a-z][a-z0-9-]{0,31}$/;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!/^[1-9]\d*$/.test(params.id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const username = (session as { username?: string }).username ?? '';
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.tags)) return NextResponse.json({ error: 'tags required' }, { status: 400 });
  const tags = body.tags
    .map((t: unknown) => String(t).toLowerCase().trim())
    .filter((t: string) => TAG_RE.test(t))
    .slice(0, 20);
  if (!tags.length) return NextResponse.json({ error: 'no valid tags' }, { status: 400 });

  const resp = await fetch(`${STORE_URL}/messages/${params.id}/tags`, {
    method: 'POST',
    headers: viewerHeaders(username, 'application/json'),
    body: JSON.stringify({ tags, source: body.source === 'user' ? 'user' : 'ai' }),
    cache: 'no-store',
  });
  const json = await resp.json().catch(() => ({}));
  return NextResponse.json(json, { status: resp.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!/^[1-9]\d*$/.test(params.id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const tag = (req.nextUrl.searchParams.get('tag') || '').toLowerCase().trim();
  if (!TAG_RE.test(tag)) return NextResponse.json({ error: 'invalid tag' }, { status: 400 });
  const username = (session as { username?: string }).username ?? '';

  const resp = await fetch(`${STORE_URL}/messages/${params.id}/tags/${encodeURIComponent(tag)}`, {
    method: 'DELETE',
    headers: viewerHeaders(username),
    cache: 'no-store',
  });
  const json = await resp.json().catch(() => ({}));
  return NextResponse.json(json, { status: resp.status });
}
