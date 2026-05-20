import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchMessage } from '@/lib/mail-store';
import { NextResponse } from 'next/server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const username = (session as { username?: string }).username ?? '';
  // Pass viewer_user to mail-store — it enforces ownership there too (defense in depth)
  const msg = await fetchMessage(params.id, username);
  return NextResponse.json(msg);
}
