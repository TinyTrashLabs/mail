import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listDrafts, createDraft } from '@/lib/mail-store';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const username = (session as { username?: string }).username ?? '';

  try {
    const data = await listDrafts(username);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status ?? 500;
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const username = (session as { username?: string }).username ?? '';

  try {
    const body = await req.json();
    const data = await createDraft(body, username);
    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status ?? 500;
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status });
  }
}
