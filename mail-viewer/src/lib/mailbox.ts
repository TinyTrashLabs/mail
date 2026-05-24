/**
 * Viewer-side mailbox helpers.
 *
 * The set of valid mailboxes mirrors mail-store/src/mailbox.js — keep these
 * in sync. Drift is acceptable in the short term (viewer just won't surface
 * a new personal mailbox until updated), but a wrong value lets users
 * silently hit a 403 with no visible feedback.
 */
export const PERSONAL_MAILBOXES = new Set([
  'david', 'shane', 'derek', 'ryan', 'patch', 'patchtest',
]);

/** Per-user sent mailbox name. Mirrors mail-store/src/mailbox.js. */
export function sentMailboxFor(username: string): string {
  return `${username}-sent`;
}

/** True if `mailbox` is the per-user sent mailbox owned by `username`. */
export function isOwnSentMailbox(mailbox: string | undefined | null, username: string): boolean {
  if (!mailbox || !username || !PERSONAL_MAILBOXES.has(username)) return false;
  return mailbox === sentMailboxFor(username);
}

export function isValidMailbox(name: string | undefined | null, viewerUser: string): boolean {
  if (!name) return false;
  if (name === 'shared') return true;
  if (isOwnSentMailbox(name, viewerUser)) return true;
  // Personal mailbox is only valid if it matches the viewer's username
  // (matches mail-store/src/access.js canAccessMailbox).
  return PERSONAL_MAILBOXES.has(name) && name === viewerUser;
}

/**
 * Resolve a requested mailbox to a valid one, falling back to the viewer's
 * personal mailbox (if they have one) or 'shared'.
 *
 * Use in server pages where an invalid ?mailbox= query param should NOT
 * silently render an empty list (which is what fetchMessages would do on
 * a 403 from mail-store).
 */
export function resolveMailbox(requested: string | undefined | null, viewerUser: string): string {
  if (isValidMailbox(requested, viewerUser)) return requested as string;
  if (PERSONAL_MAILBOXES.has(viewerUser)) return viewerUser;
  return 'shared';
}
