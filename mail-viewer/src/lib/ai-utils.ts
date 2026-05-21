/**
 * Pure utility functions shared between AI route handlers and unit tests.
 * No Next.js / server-only imports — safe to import in Jest.
 */

/**
 * Mailboxes a given username is allowed to query.
 * Prevents IDOR via arbitrary mailbox params from request bodies.
 */
export function allowedMailboxes(username: string): string[] {
  return [username, 'shared'];
}

/**
 * Parse Claude's JSON response, stripping optional markdown code fences.
 * Returns null if the input is empty or not valid JSON.
 */
export function parseAISearchResponse(
  raw: string
): { indices?: number[]; explanation?: string } | null {
  if (!raw.trim()) return null;
  try {
    const clean = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

/**
 * Filter Claude's index array to valid in-bounds numbers only.
 */
export function filterIndices(indices: unknown[] | undefined, length: number): number[] {
  return (indices || []).filter(
    (i): i is number => typeof i === 'number' && i >= 0 && i < length
  );
}

/**
 * Strip HTML to plain text for AI summarization.
 * Uses sanitize-html to remove script/style bodies (preventing prompt contamination),
 * then decodes HTML entities via the 'he' library.
 * Block-level tags get a space injected before stripping so adjacent text
 * nodes don't run together.
 */
export function stripHtml(html: string): string {
  // Dynamic require so this module stays importable in Jest without Next.js env
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sanitize = require('sanitize-html') as (s: string, o: object) => string;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const he = require('he') as { decode: (s: string) => string };

  // Replace block/separator tags with a space before stripping so adjacent
  // text nodes are separated (e.g. "Line1<br/>Line2" → "Line1 Line2").
  const spaced = html.replace(/<\/(p|div|li|dt|dd|tr|th|td|blockquote|pre|h[1-6])>|<(br|hr)\s*\/?>/gi, ' ');

  const stripped = sanitize(spaced, {
    allowedTags: [],
    allowedAttributes: {},
  });

  // Decode HTML entities (&amp; → &, &lt; → <, etc.)
  const decoded = he.decode(stripped);

  return decoded.replace(/\s+/g, ' ').trim();
}
