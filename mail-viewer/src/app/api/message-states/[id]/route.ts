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

  // Only allow known boolean fields (allowlist, kept in sync with mail-store PATCH_COLUMNS).
  const allowed = ['is_read', 'is_starred', 'is_trashed'] as const;
  const patch: Partial<Record<typeof allowed[number], boolean>> = {};
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') {
      return NextResponse.json({ error: `${key} must be boolean` }, { status: 400 });
    }
    patch[key] = body[key] as boolean;
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
