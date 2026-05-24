/**
 * drift-guard.js — INGEST_SECRET drift detector
 *
 * Probes the live CF worker endpoint every CHECK_INTERVAL_MS with the
 * current INGEST_SECRET. A 401 response means the secret in mail-store
 * diverges from what the CF worker expects — we alert via MM and log.
 *
 * Probe logic:
 *   POST <INGEST_ENDPOINT>/ingest  Authorization: Bearer <INGEST_SECRET>  body: {}
 *   400 → secret accepted (body rejected for missing `raw`) → IN SYNC
 *   401 → secret rejected → DRIFT DETECTED
 *   other → transient / infra error → skip (log warning, don't alert)
 *
 * Security note: the Authorization header contains INGEST_SECRET and is
 * sent on every real ingest request too. Cloudflare Workers do not log
 * request headers to accessible storage in production; no additional
 * exposure beyond what every inbound email already creates.
 *
 * Env vars:
 *   INGEST_SECRET         — current mail-store secret (required)
 *   INGEST_ENDPOINT       — base URL of CF ingest worker (default: https://mail-ingest.tinytrashlabs.com)
 *   MM_BASE_URL           — Mattermost base URL (optional; skip alert if absent)
 *   MM_BOT_TOKEN          — MM bot PAT (optional)
 *   DRIFT_ALERT_CHANNEL   — MM channel name to ping on drift (default: it-help)
 *   CHECK_INTERVAL_MS     — how often to probe (default: 600000 = 10 min)
 */

import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

const INGEST_SECRET    = process.env.INGEST_SECRET;
const INGEST_ENDPOINT  = process.env.INGEST_ENDPOINT || 'https://mail-ingest.tinytrashlabs.com';
const MM_BASE_URL      = process.env.MM_BASE_URL;
const MM_BOT_TOKEN     = process.env.MM_BOT_TOKEN;
const ALERT_CHANNEL    = process.env.DRIFT_ALERT_CHANNEL || 'it-help';
const INTERVAL_MS      = parseInt(process.env.CHECK_INTERVAL_MS || '600000', 10);

export function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function mmPost(mmBaseUrl, mmBotToken, alertChannel, message) {
  if (!mmBaseUrl || !mmBotToken) return;
  try {
    // Resolve channel id by name
    const ch = await request(
      `${mmBaseUrl}/api/v4/channels/name/${encodeURIComponent(alertChannel)}?team_name=ttl`,
      { method: 'GET', headers: { Authorization: `Bearer ${mmBotToken}` } }
    );
    if (ch.status !== 200) {
      // Fallback: search
      const ch2 = await request(
        `${mmBaseUrl}/api/v4/channels/search`,
        { method: 'POST', headers: { Authorization: `Bearer ${mmBotToken}`, 'Content-Type': 'application/json' } },
        JSON.stringify({ term: alertChannel })
      );
      const channels = JSON.parse(ch2.body);
      if (!Array.isArray(channels) || !channels[0]?.id) {
        console.warn('[drift-guard] could not resolve MM channel for alert');
        return;
      }
      const channelId = channels[0].id;
      await request(
        `${mmBaseUrl}/api/v4/posts`,
        { method: 'POST', headers: { Authorization: `Bearer ${mmBotToken}`, 'Content-Type': 'application/json' } },
        JSON.stringify({ channel_id: channelId, message })
      );
      return;
    }
    const channelId = JSON.parse(ch.body).id;
    await request(
      `${mmBaseUrl}/api/v4/posts`,
      { method: 'POST', headers: { Authorization: `Bearer ${mmBotToken}`, 'Content-Type': 'application/json' } },
      JSON.stringify({ channel_id: channelId, message })
    );
  } catch (err) {
    console.warn('[drift-guard] MM alert failed:', err.message);
  }
}

export const ALERT_DEBOUNCE_MS = 60 * 60 * 1000;

/**
 * Run one probe cycle.
 *
 * @param {object} opts
 * @param {string}   opts.ingestSecret
 * @param {string}   opts.ingestEndpoint
 * @param {string}   [opts.mmBaseUrl]
 * @param {string}   [opts.mmBotToken]
 * @param {string}   [opts.alertChannel]
 * @param {Function} opts.requestFn   — injectable for tests (default: module-level `request`)
 * @param {Function} opts.mmPostFn    — injectable for tests (default: module-level `mmPost`)
 * @param {{ value: number }} opts.alertedAtRef — mutable ref to debounce state
 * @returns {Promise<'in-sync'|'drift'|'error'>}
 */
export async function runCheck({
  ingestSecret,
  ingestEndpoint,
  mmBaseUrl,
  mmBotToken,
  alertChannel = 'it-help',
  requestFn = request,
  mmPostFn = mmPost,
  alertedAtRef,
}) {
  try {
    const body = JSON.stringify({});
    const result = await requestFn(
      `${ingestEndpoint}/ingest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ingestSecret}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      body
    );

    if (result.status === 400) {
      console.log(`[drift-guard] ${new Date().toISOString()} OK — secrets in sync`);
      alertedAtRef.value = 0; // reset debounce on recovery
      return 'in-sync';
    } else if (result.status === 401) {
      const now = Date.now();
      console.error(`[drift-guard] ${new Date().toISOString()} DRIFT DETECTED — 401 from ${ingestEndpoint}`);
      if (now - alertedAtRef.value > ALERT_DEBOUNCE_MS) {
        alertedAtRef.value = now;
        await mmPostFn(
          mmBaseUrl, mmBotToken, alertChannel,
          `⚠️ **INGEST_SECRET drift detected** — mail-store and CF worker secrets are out of sync.\n` +
          `CF worker returned 401 on probe to \`${ingestEndpoint}\`.\n` +
          `Fix: re-sync the secret in Infisical and redeploy both services. ` +
          `Until fixed, incoming mail is being dropped.`
        );
      }
      return 'drift';
    } else {
      console.warn(`[drift-guard] ${new Date().toISOString()} unexpected status ${result.status} — skipping`);
      return 'error';
    }
  } catch (err) {
    console.warn(`[drift-guard] ${new Date().toISOString()} probe error: ${err.message}`);
    return 'error';
  }
}

// Only run the loop when executed directly (not imported in tests).
if (process.argv[1] && new URL(process.argv[1], 'file:').pathname === new URL(import.meta.url).pathname) {
  if (!INGEST_SECRET) {
    console.error('[drift-guard] INGEST_SECRET is required');
    process.exit(1);
  }
  const alertedAtRef = { value: 0 };
  console.log(`[drift-guard] starting — probing ${INGEST_ENDPOINT} every ${INTERVAL_MS / 1000}s`);
  runCheck({ ingestSecret: INGEST_SECRET, ingestEndpoint: INGEST_ENDPOINT, mmBaseUrl: MM_BASE_URL, mmBotToken: MM_BOT_TOKEN, alertChannel: ALERT_CHANNEL, alertedAtRef });
  setInterval(() => runCheck({ ingestSecret: INGEST_SECRET, ingestEndpoint: INGEST_ENDPOINT, mmBaseUrl: MM_BASE_URL, mmBotToken: MM_BOT_TOKEN, alertChannel: ALERT_CHANNEL, alertedAtRef }), INTERVAL_MS);
}
