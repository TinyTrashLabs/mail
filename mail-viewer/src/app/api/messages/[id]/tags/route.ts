/**
 * Per-message tag management — POST adds, DELETE removes (via ?tag= query).
 * Both proxy to mail-store with a minted viewer token so access control
 * happens in one place.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import crypto from 'node:crypto';

const STORE_URL = process.env.MAIL_STORE_URL!;
const VIEWER_SECRET = process.env.VIEWER_SECRET!;
const TTL_SECONDS = 5 * 60;

function mintViewerToken(user: string): string {
  const payload = { user, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', VIEWER_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function viewerHeaders(user: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${VIEWER_SECRET}`,
    'X-Viewer-User': mintViewerToken(user),
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!/^[1-9]\d*$/.test(params.id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const username = (session as { username?: string }).username ?? '';
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.tags)) return NextResponse.json({ error: 'tags required' }, { status: 400 });

  const resp = await fetch(`${STORE_URL}/messages/${params.id}/tags`, {
    method: 'POST',
    headers: viewerHeaders(username, 'application/json'),
    body: JSON.stringify({ tags: body.tags, source: body.source || 'user' }),
    cache: 'no-store',
  });
  const json = await resp.json().catch(() => ({}));
  return NextResponse.json(json, { status: resp.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!/^[1-9]\d*$/.test(params.id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const tag = req.nextUrl.searchParams.get('tag') || '';
  if (!tag) return NextResponse.json({ error: 'tag required' }, { status: 400 });
  const username = (session as { username?: string }).username ?? '';

  const resp = await fetch(`${STORE_URL}/messages/${params.id}/tags/${encodeURIComponent(tag)}`, {
    method: 'DELETE',
    headers: viewerHeaders(username),
    cache: 'no-store',
  });
  const json = await resp.json().catch(() => ({}));
  return NextResponse.json(json, { status: resp.status });
}
