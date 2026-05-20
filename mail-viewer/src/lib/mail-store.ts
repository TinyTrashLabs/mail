import crypto from 'node:crypto';

export interface MailMessage {
  id: number;
  message_id: string | null;
  in_reply_to: string | null;
  subject: string;
  from_addr: string;
  to_addrs: { name: string; address: string }[];
  cc_addrs: { name: string; address: string }[];
  received_at: string;
  text_body: string | null;
  html_body: string | null;
  attachments_meta: { filename: string; contentType: string; size: number }[];
  mailbox: string;
}

export interface MessagesResponse {
  messages: Omit<MailMessage, 'text_body' | 'html_body'>[];
  total: number;
  page: number;
  limit: number;
}

const STORE_URL = process.env.MAIL_STORE_URL!;
const VIEWER_SECRET = process.env.VIEWER_SECRET!;
const TTL_SECONDS = 5 * 60;

export class MailStoreError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Mint a short-lived HMAC-signed viewer token. The mail-store verifies the
 * HMAC before trusting the username — so even a bug in this process that
 * lets a request control its own username gets caught.
 */
function mintViewerToken(user: string): string {
  const payload = { user, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', VIEWER_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

async function callStore(path: string): Promise<Response> {
  const url = `${STORE_URL}${path}`;
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${VIEWER_SECRET}`,
      // username rides as a signed token, NOT as a query param the route trusts blindly
      'X-Viewer-User': mintViewerToken(''),
    },
    cache: 'no-store',
  });
}

async function callStoreAs(path: string, viewerUser: string): Promise<Response> {
  const url = `${STORE_URL}${path}`;
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${VIEWER_SECRET}`,
      'X-Viewer-User': mintViewerToken(viewerUser),
    },
    cache: 'no-store',
  });
}

export async function fetchMessages(
  mailbox: string,
  viewerUser: string,
  page = 1,
  limit = 50
): Promise<MessagesResponse> {
  const qs = `?mailbox=${encodeURIComponent(mailbox)}&page=${page}&limit=${limit}`;
  const resp = await callStoreAs(`/messages${qs}`, viewerUser);
  if (!resp.ok) throw new MailStoreError(resp.status, `mail-store ${resp.status}`);
  return resp.json();
}

export async function fetchMessage(id: string | number, viewerUser: string): Promise<MailMessage> {
  const resp = await callStoreAs(`/messages/${encodeURIComponent(String(id))}`, viewerUser);
  if (!resp.ok) throw new MailStoreError(resp.status, `mail-store ${resp.status}`);
  return resp.json();
}

// Re-export for callers that haven't imported it directly
export { callStore };
