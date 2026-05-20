/** Personal mailbox names — only these get per-user scoping in the viewer. */
export const PERSONAL = new Set(['david', 'shane', 'derek', 'ryan']);

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
