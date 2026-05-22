import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

const STORE_URL = process.env.MAIL_STORE_URL!;
const VIEWER_SECRET = process.env.VIEWER_SECRET!;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const mailbox = req.nextUrl.searchParams.get('mailbox') || 'shared';
  const resp = await fetch(`${STORE_URL}/tags?mailbox=${encodeURIComponent(mailbox)}`, {
    headers: { Authorization: `Bearer ${VIEWER_SECRET}` },
    cache: 'no-store',
  });
  if (!resp.ok) return NextResponse.json({ error: 'store error' }, { status: 502 });
  return NextResponse.json(await resp.json());
}
