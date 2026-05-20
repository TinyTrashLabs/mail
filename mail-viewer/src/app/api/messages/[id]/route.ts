import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessage, MailStoreError } from '@/lib/mail-store';
import { NextResponse } from 'next/server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Input validation: id must be a positive integer string.
  if (!/^[1-9]\d*$/.test(params.id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const username = (session as { username?: string }).username ?? '';
  try {
    const msg = await fetchMessage(params.id, username);
    return NextResponse.json(msg);
  } catch (err) {
    if (err instanceof MailStoreError) {
      // Surface auth/404 cleanly — don't dump 500 when mail-store said 400/403/404.
      if (err.status === 400) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
      if (err.status === 401) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      if (err.status === 403 || err.status === 404) {
        return NextResponse.json({ error: 'not found' }, { status: 404 });
      }
    }
    console.error('mail-store fetchMessage error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
