import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessages } from '@/lib/mail-store';
import { NextRequest, NextResponse } from 'next/server';

const PERSONAL = new Set(['david', 'shane', 'derek', 'ryan']);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const username = (session as { username?: string }).username ?? '';
  const reqMailbox = req.nextUrl.searchParams.get('mailbox') || 'shared';
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
  const tag = req.nextUrl.searchParams.get('tag') || undefined;

  // Viewer-layer guard: reject before even hitting the store
  const allowed =
    reqMailbox === 'shared' ||
    (PERSONAL.has(reqMailbox) && reqMailbox === username);
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const data = await fetchMessages(reqMailbox, username, page, 50, tag);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status ?? 500;
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status });
  }
}
