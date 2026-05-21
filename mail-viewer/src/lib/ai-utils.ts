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
 * Strip HTML tags and collapse whitespace.
 * Used as a fallback to extract plain text from html_body for AI summarization.
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
