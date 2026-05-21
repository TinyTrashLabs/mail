/**
 * Simple in-memory per-user rate limiter for AI routes.
 * Allows MAX_CALLS per WINDOW_MS per username.
 * Good enough for an internal tool — not a distributed solution.
 */

const MAX_CALLS = 20;
const WINDOW_MS = 60_000; // 1 minute

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

export function checkRateLimit(username: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = store.get(username);

  if (!entry || now >= entry.resetAt) {
    store.set(username, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_CALLS) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true };
}
