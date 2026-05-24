/** Personal mailbox names — only these get per-user scoping in the viewer. */
export const PERSONAL = new Set(['david', 'shane', 'derek', 'ryan', 'patch', 'patchtest']);

/**
 * Per-user "sent" mailbox name. Messages persisted from the compose flow
 * are stored under `<username>-sent` so each user sees only what they sent.
 */
export function sentMailboxFor(username) {
  return `${username}-sent`;
}

/** True if `mailbox` is the per-user sent mailbox owned by `username`. */
export function isOwnSentMailbox(mailbox, username) {
  if (!username || !PERSONAL.has(username)) return false;
  return mailbox === sentMailboxFor(username);
}

/**
 * Resolve which mailbox an incoming message belongs to.
 * Personal addresses → owner's scoped mailbox.
 * Everything else → 'shared'.
 */
export function resolveMailbox(envelopeTo) {
  if (!envelopeTo) return 'shared';
  const local = envelopeTo.split('@')[0].toLowerCase();
  return PERSONAL.has(local) ? local : 'shared';
}
