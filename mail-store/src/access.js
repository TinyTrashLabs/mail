import { PERSONAL } from './mailbox.js';

/**
 * Pure access-control predicates. Exported so route handlers AND tests
 * import the same function — no risk of tests drifting from production logic.
 */

export function canAccessMailbox(requestedMailbox, viewerUser) {
  return (
    requestedMailbox === 'shared' ||
    (PERSONAL.has(requestedMailbox) && requestedMailbox === viewerUser)
  );
}

export function canReadMessage(msgMailbox, viewerUser) {
  return (
    msgMailbox === 'shared' ||
    (PERSONAL.has(msgMailbox) && msgMailbox === viewerUser)
  );
}

/**
 * Validate that an id from req.params is a positive integer.
 * Returns the parsed integer on success, or null on any malformed input.
 */
export function parseMessageId(raw) {
  if (raw === undefined || raw === null) return null;
  // Strict: must be all digits, no leading zeros allowed except "0" itself
  // (and 0 is not a valid id since SERIAL starts at 1).
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const s = String(raw);
  if (!/^[1-9]\d*$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}
