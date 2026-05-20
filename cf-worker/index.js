/**
 * Cloudflare Email Worker — receives inbound email via Email Routing
 * and forwards the raw RFC822 message to the mail-store ingest endpoint.
 */
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

    const b64 = btoa(String.fromCharCode(...raw));

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
