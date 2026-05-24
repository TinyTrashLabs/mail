/**
 * Cloudflare Email Worker — receives inbound email via Email Routing
 * and forwards the raw RFC822 message to the mail-store ingest endpoint.
 *
 * Note: emails can be megabytes. We must NOT do
 * `btoa(String.fromCharCode(...raw))` because spreading a large Uint8Array
 * into String.fromCharCode blows the call-stack on big messages, and
 * String.fromCharCode + btoa is restricted to Latin1 — bytes > 0xFF in
 * the spread would already be wrong but we also have to handle binary
 * safely. We encode in 8KB chunks and use byte-by-byte char codes.
 */
function bytesToBase64(bytes) {
  // 8KB chunks. String.fromCharCode.apply has engine-defined argument-count
  // limits (V8 historically ~125k, but conservative caps in other engines
  // can be much lower). 8KB stays well under any reasonable cap while
  // remaining ~1000x faster than per-byte concatenation for typical
  // multi-MB emails.
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    // String.fromCharCode is safe per-byte (each byte is 0..255 → BMP code point).
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

export default {
  async email(message, env) {
    // 1) Forward FIRST so gmail backup never depends on mail-store being up.
    //    Email Routing requires the destination to be verified at the account
    //    level. Two forms supported:
    //      - FORWARD_TO = "user@example.com"            — forward EVERY message
    //      - FORWARD_MAP = '{"david@x":"foo@gmail",...}' — per-recipient routing
    //    FORWARD_MAP wins when both are set, and only forwards if message.to
    //    matches a key (case-insensitive).
    const recipient = (message.to || '').toLowerCase();
    let forwardTo = null;
    if (env.FORWARD_MAP) {
      try {
        const raw = JSON.parse(env.FORWARD_MAP);
        // Normalize keys once so the lookup is O(1) and case-insensitive.
        const map = {};
        for (const [k, v] of Object.entries(raw)) {
          map[k.toLowerCase()] = v;
        }
        if (map[recipient]) forwardTo = map[recipient];
      } catch (err) {
        console.log(`FORWARD_MAP parse failed: ${err && err.message}`);
      }
    }
    if (!forwardTo && env.FORWARD_TO) {
      forwardTo = env.FORWARD_TO;
    }
    if (forwardTo) {
      try {
        await message.forward(forwardTo);
      } catch (err) {
        // A forward failure (e.g. destination not yet verified for this
        // address) should NOT swallow ingest — log and continue.
        console.log(`forward to ${forwardTo} failed: ${err && err.message}`);
      }
    }

    // 2) Slurp raw bytes once for ingest.
    const chunks = [];
    const reader = message.raw.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const raw = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.length;
    }

    const b64 = bytesToBase64(raw);

    const resp = await fetch(`${env.MAIL_STORE_URL}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.INGEST_SECRET}`,
      },
      body: JSON.stringify({
        raw: b64,
        envelope_from: message.from,
        envelope_to: message.to,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`mail-store ingest failed: ${resp.status} ${body}`);
    }
  },
};
