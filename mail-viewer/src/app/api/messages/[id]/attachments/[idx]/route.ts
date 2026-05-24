import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { mintViewerToken } from '@/lib/mail-store';

const STORE_URL = process.env.MAIL_STORE_URL!;
const VIEWER_SECRET = process.env.VIEWER_SECRET!;

export async function GET(
  _req: Request,
  { params }: { params: { id: string; idx: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!/^[1-9]\d*$/.test(params.id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  if (!/^\d+$/.test(params.idx)) {
    return NextResponse.json({ error: 'invalid idx' }, { status: 400 });
  }

  const username = (session as { username?: string }).username ?? '';
  const upstream = await fetch(
    `${STORE_URL}/messages/${params.id}/attachments/${params.idx}`,
    {
      headers: {
        Authorization: `Bearer ${VIEWER_SECRET}`,
        'X-Viewer-User': mintViewerToken(username),
      },
      cache: 'no-store',
    }
  );

  if (!upstream.ok) {
    const status = upstream.status === 404 ? 404 : 500;
    return NextResponse.json({ error: 'not found' }, { status });
  }

  // Proxy the binary response with the correct headers.
  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const disposition = upstream.headers.get('content-disposition') ?? 'attachment';
  const buf = await upstream.arrayBuffer();

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
