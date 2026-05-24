/**
 * display-name — formatting helpers for sender / recipient names.
 *
 * Used in the inbox list, the message detail header, and any other surface
 * that renders a person's name. Goal: Gmail-mobile parity — the visible
 * label is the proper-cased human name when we have one, falling back to
 * a Titled version of the local-part of the email when we don't.
 */

/**
 * Capitalize each space- or hyphen-separated word.
 * "patrick o'brien" -> "Patrick O'Brien"
 * "jean-luc picard" -> "Jean-Luc Picard"
 */
export function titleCase(s: string): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'\.])(\S)/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Turn an email address local-part into a display name.
 * "david.freeman@x" -> "David Freeman"
 * "patch" -> "Patch"
 * "ttl-bot+notify" -> "Ttl Bot"
 *
 * Strips +tags, replaces dots/underscores with spaces, then title-cases.
 */
export function localPartToName(addr: string): string {
  if (!addr) return '';
  const local = (addr.split('@')[0] || addr).split('+')[0];
  const spaced = local.replace(/[\._]+/g, ' ').trim();
  return titleCase(spaced);
}

/**
 * Format a recipient/sender for display. Prefers `name` when provided
 * (and non-empty after trim), else falls back to the local-part of the
 * address. Always returns title-cased text.
 */
export function formatDisplayName(input: {
  name?: string | null;
  address?: string | null;
}): string {
  const name = (input.name || '').trim();
  if (name) return titleCase(name);
  return localPartToName(input.address || '');
}

/**
 * Convenience: format a bare "from_addr" string. Splits on first '<' if
 * the address is in "Display <addr@host>" form, otherwise treats the
 * entire string as an address.
 */
export function formatFromAddr(fromAddr: string): string {
  if (!fromAddr) return '';
  const m = fromAddr.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) {
    const name = (m[1] || '').trim();
    if (name) return titleCase(name);
    return localPartToName(m[2]);
  }
  return localPartToName(fromAddr);
}
