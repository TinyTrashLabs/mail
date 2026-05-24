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
import { PERSONAL_MAILBOXES } from '@/lib/mailbox';

const AVATAR_DIR = process.env.AVATAR_DIR ?? path.join(process.cwd(), 'data', 'avatars');
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB upload limit

// Strict shape check: alphanumeric + hyphen + underscore, 1-32 chars.
// Applied on both GET (enumeration guard) and POST (write guard).
const SAFE_USERNAME = /^[a-zA-Z0-9_-]{1,32}$/;

function safeAvatarPath(username: string): string | null {
  if (!SAFE_USERNAME.test(username)) return null;
  return path.join(AVATAR_DIR, `${username}.jpg`);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });

  const username = req.nextUrl.searchParams.get('user') ?? '';
  const file = safeAvatarPath(username);
  if (!file) return new NextResponse(null, { status: 404 });
  // Defense-in-depth: confirm resolved path stays within AVATAR_DIR even though
  // SAFE_USERNAME regex already makes traversal impossible.
  if (path.relative(AVATAR_DIR, file).startsWith('..')) return new NextResponse(null, { status: 404 });
  if (!existsSync(file)) return new NextResponse(null, { status: 404 });

  const buf = await fs.readFile(file);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const username = (session as { username?: string }).username ?? '';
  // safeAvatarPath enforces SAFE_USERNAME regex — returns null if session username
  // has an unexpected shape (e.g. OAuth sub instead of plain username).
  const filePath = safeAvatarPath(username);
  if (!filePath) return NextResponse.json({ error: 'invalid username' }, { status: 400 });
  // Defense-in-depth path containment — SAFE_USERNAME already prevents traversal
  // but verify the resolved path stays within AVATAR_DIR.
  if (path.relative(AVATAR_DIR, filePath).startsWith('..')) {
    return NextResponse.json({ error: 'invalid username' }, { status: 400 });
  }
  // Only PERSONAL_MAILBOXES members may upload — prevents arbitrary auth'd users
  // (e.g. a future shared-mailbox account) from writing to AVATAR_DIR.
  if (!PERSONAL_MAILBOXES.has(username)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Reject before buffering when Content-Length header signals oversize body.
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 4 MB)' }, { status: 413 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get('avatar');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing avatar field' }, { status: 400 });
  }

  // Re-check after buffering (Content-Length can be absent or spoofed).
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 4 MB)' }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Don't trust client-supplied MIME type — let sharp decode to validate.
  // Cover-crop to 256×256, output JPEG q85.
  let processed: Buffer;
  try {
    processed = await sharp(buf, { limitInputPixels: 4096 * 4096 })
      .resize(256, 256, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: 'could not decode image' }, { status: 415 });
  }

  await fs.mkdir(AVATAR_DIR, { recursive: true });
  await fs.writeFile(filePath, processed);

  return NextResponse.json({ ok: true, user: username });
}
