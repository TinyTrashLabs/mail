/**
 * GET  /api/avatar?user=<username>  → serve avatar image (or 404)
 * POST /api/avatar                  → upload avatar for the authed user
 *
 * Avatars are stored on disk in AVATAR_DIR/<username>.jpg (default: data/avatars/).
 * Sharp resizes/crops to 256×256 JPEG before writing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const AVATAR_DIR = process.env.AVATAR_DIR ?? path.join(process.cwd(), 'data', 'avatars');
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB upload limit

function avatarPath(username: string): string {
  // Strip everything that could escape the directory
  const safe = username.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  return path.join(AVATAR_DIR, `${safe}.jpg`);
}

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('user') ?? '';
  if (!username) return NextResponse.json({ error: 'missing user' }, { status: 400 });

  const file = avatarPath(username);
  if (!existsSync(file)) return new NextResponse(null, { status: 404 });

  const buf = await fs.readFile(file);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const username = (session as { username?: string }).username ?? '';
  if (!username) return NextResponse.json({ error: 'no username in session' }, { status: 400 });

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get('avatar');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing avatar field' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 4 MB)' }, { status: 413 });
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'unsupported image type' }, { status: 415 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Cover-crop to 256×256, output JPEG q85
  const processed = await sharp(buf)
    .resize(256, 256, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();

  await fs.mkdir(AVATAR_DIR, { recursive: true });
  await fs.writeFile(avatarPath(username), processed);

  return NextResponse.json({ ok: true, user: username });
}
