/**
 * Resolve which mailbox an incoming message belongs to.
 * Any user's local-part address routes to their personal mailbox.
 * The catch-all 'shared' mailbox is preserved for non-user addresses.
 */
export function resolveMailbox(envelopeTo) {
  if (!envelopeTo) return 'shared';
  const local = envelopeTo.split('@')[0].toLowerCase();
  return local || 'shared';
}
