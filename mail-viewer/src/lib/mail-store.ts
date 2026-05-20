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

export class MailStoreError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Fetch message list for a mailbox. viewer_user is the session username for server-side enforcement. */
export async function fetchMessages(
  mailbox: string,
  viewerUser: string,
  page = 1,
  limit = 50
): Promise<MessagesResponse> {
  const url = `${STORE_URL}/messages?mailbox=${encodeURIComponent(mailbox)}&viewer_user=${encodeURIComponent(viewerUser)}&page=${page}&limit=${limit}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${VIEWER_SECRET}` },
    cache: 'no-store',
  });
  if (!resp.ok) throw new MailStoreError(resp.status, `mail-store ${resp.status}`);
  return resp.json();
}

/** Fetch a single message. viewer_user passed so mail-store enforces ownership server-side. */
export async function fetchMessage(id: string | number, viewerUser: string): Promise<MailMessage> {
  const url = `${STORE_URL}/messages/${id}?viewer_user=${encodeURIComponent(viewerUser)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${VIEWER_SECRET}` },
    cache: 'no-store',
  });
  if (!resp.ok) throw new MailStoreError(resp.status, `mail-store ${resp.status}`);
  return resp.json();
}
