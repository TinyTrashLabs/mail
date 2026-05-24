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
  tags?: string[];
}

export interface MessageState {
  is_read: boolean;
  is_starred: boolean;
  is_trashed: boolean;
}

export type StateMap = Record<string, MessageState>;

export interface MessagesResponse {
  messages: (Omit<MailMessage, 'text_body' | 'html_body'> & { tags: string[] })[];
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

export function mintViewerToken(user: string): string {
  const payload = { user, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', VIEWER_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function viewerHeaders(user: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${VIEWER_SECRET}`,
    'X-Viewer-User': mintViewerToken(user),
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
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
  limit = 50,
  tag?: string,
  opts?: { trashOnly?: boolean }
): Promise<MessagesResponse> {
  let qs = `?mailbox=${encodeURIComponent(mailbox)}&page=${page}&limit=${limit}`;
  if (tag) qs += `&tag=${encodeURIComponent(tag)}`;
  if (opts?.trashOnly) qs += `&trash=1`;
  const resp = await callStoreAs(`/messages${qs}`, viewerUser);
  if (!resp.ok) throw new MailStoreError(resp.status, `mail-store ${resp.status}`);
  return resp.json();
}

export async function fetchMessage(id: string | number, viewerUser: string): Promise<MailMessage> {
  const resp = await callStoreAs(`/messages/${encodeURIComponent(String(id))}`, viewerUser);
  if (!resp.ok) throw new MailStoreError(resp.status, `mail-store ${resp.status}`);
  return resp.json();
}

export async function fetchMessageStates(ids: number[], viewerUser: string): Promise<StateMap> {
  if (!ids.length) return {};
  const qs = `?ids=${ids.join(',')}`;
  const resp = await callStoreAs(`/message-states${qs}`, viewerUser);
  if (!resp.ok) {
    console.error(`fetchMessageStates: mail-store returned ${resp.status}`);
    return {};
  }
  return resp.json();
}

/**
 * Persist a record of a just-sent message into the viewer user's Sent mailbox.
 * Best-effort: callers should NOT block a successful Resend response on this.
 * BCC recipients are accepted but the store discards them server-side for
 * privacy — the sent row reveals only To/CC.
 */
export async function persistSent(
  viewerUser: string,
  payload: {
    messageId?: string | null;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text: string;
    html?: string | null;
    sentAt?: string;
  }
): Promise<{ id: number | null; mailbox: string; duplicate: boolean }> {
  const url = `${STORE_URL}/sent`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VIEWER_SECRET}`,
      'X-Viewer-User': mintViewerToken(viewerUser),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (!resp.ok) throw new MailStoreError(resp.status, `mail-store ${resp.status}`);
  return resp.json();
}

export async function patchMessageState(
  id: number,
  patch: Partial<MessageState>,
  viewerUser: string
): Promise<MessageState> {
  const url = `${STORE_URL}/message-states/${id}`;
  const token = mintViewerToken(viewerUser);
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${VIEWER_SECRET}`,
      'X-Viewer-User': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
    cache: 'no-store',
  });
  if (!resp.ok) throw new MailStoreError(resp.status, `mail-store ${resp.status}`);
  return resp.json();
}
