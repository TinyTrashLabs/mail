/**
 * Unit tests for the in-memory AI rate limiter.
 */
import { checkRateLimit } from '../../src/lib/ai-rate-limit';

describe('checkRateLimit', () => {
  // Each test uses a unique username to avoid state bleed
  const uid = () => `user-${Math.random().toString(36).slice(2)}`;

  it('allows first call', () => {
    expect(checkRateLimit(uid()).allowed).toBe(true);
  });

  it('allows up to MAX_CALLS (20) calls within window', () => {
    const u = uid();
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(u).allowed).toBe(true);
    }
  });

  it('blocks the 21st call', () => {
    const u = uid();
    for (let i = 0; i < 20; i++) checkRateLimit(u);
    const result = checkRateLimit(u);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('different users have independent limits', () => {
    const u1 = uid();
    const u2 = uid();
    for (let i = 0; i < 20; i++) checkRateLimit(u1);
    expect(checkRateLimit(u1).allowed).toBe(false);
    expect(checkRateLimit(u2).allowed).toBe(true);
  });
});
