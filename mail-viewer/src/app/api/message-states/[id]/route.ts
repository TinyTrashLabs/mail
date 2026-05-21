import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { patchMessageState } from '@/lib/mail-store';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const username = (session as { username?: string }).username ?? '';
  if (!username) return NextResponse.json({ error: 'no username' }, { status: 403 });

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Only allow known boolean fields
  const patch: { is_read?: boolean; is_starred?: boolean } = {};
  if (body.is_read !== undefined) {
    if (typeof body.is_read !== 'boolean') {
      return NextResponse.json({ error: 'is_read must be boolean' }, { status: 400 });
    }
    patch.is_read = body.is_read;
  }
  if (body.is_starred !== undefined) {
    if (typeof body.is_starred !== 'boolean') {
      return NextResponse.json({ error: 'is_starred must be boolean' }, { status: 400 });
    }
    patch.is_starred = body.is_starred;
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  try {
    const state = await patchMessageState(id, patch, username);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: 'store error' }, { status: 502 });
  }
}
