import { resolveMailbox } from './mailbox.js';

/**
 * Pure field extraction from a parsed RFC822 message + envelope data.
 * Exported so route handlers AND tests import the same function.
 */
export function extractFields(parsed, envelopeFrom, envelopeTo) {
  const mailbox = resolveMailbox(envelopeTo);
  const messageId = parsed.messageId || null;
  const toAddrs = (parsed.to?.value || []).map(a => ({ name: a.name, address: a.address }));
  const ccAddrs = (parsed.cc?.value || []).map(a => ({ name: a.name, address: a.address }));
  const attachmentsMeta = (parsed.attachments || []).map(a => ({
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
  }));
  return {
    mailbox,
    messageId,
    inReplyTo: parsed.inReplyTo || null,
    subject: parsed.subject || '(no subject)',
    fromAddr: parsed.from?.text || envelopeFrom || '',
    toAddrs,
    ccAddrs,
    receivedAt: parsed.date || new Date(),
    textBody: parsed.text || null,
    htmlBody: parsed.html || null,
    attachmentsMeta,
  };
}
