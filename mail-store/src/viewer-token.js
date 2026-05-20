import crypto from 'node:crypto';

/**
 * Signed viewer-identity tokens.
 *
 * Format: base64url(JSON({ user, exp })) + "." + base64url(HMAC-SHA256(payload))
 *
 * The mail-viewer (which holds VIEWER_SECRET) mints these from the
 * authenticated NextAuth session and sends them as X-Viewer-User on every
 * request. The mail-store verifies the HMAC before trusting the username.
 *
 * Why not just a query param? Because then any request that reaches the
 * mail-store with the bearer secret can claim any username. With a signed
 * token, even a bug in the viewer that lets a request control its own
 * username gets caught — the username has to ride on a token the route
 * never accepts as user input.
 */

const TTL_SECONDS = 5 * 60; // 5 minutes is plenty for a single request

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(str, 'base64url');
}

function getSecret() {
  const s = process.env.VIEWER_SECRET;
  if (!s) throw new Error('VIEWER_SECRET not set');
  return s;
}

export function mintViewerToken(user) {
  const payload = { user: String(user || ''), exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

/**
 * Verify and decode a viewer token.
 * Returns the user string on success, or null on any failure (bad sig, expired, malformed).
 * Never throws.
 */
export function verifyViewerToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let expectedSig;
  try {
    expectedSig = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();
  } catch {
    return null;
  }

  let providedSig;
  try {
    providedSig = b64urlDecode(sigB64);
  } catch {
    return null;
  }

  if (providedSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || typeof payload.user !== 'string') return null;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload.user;
}
