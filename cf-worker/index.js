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
  const CHUNK = 0x8000; // 32k bytes per chunk
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    // String.fromCharCode is safe per-byte (each byte is 0..255 → BMP code point).
    // Apply with a chunked slice to avoid call-stack overflow.
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

export default {
  async email(message, env) {
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
