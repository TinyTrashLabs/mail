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
 * Env vars:
 *   INGEST_SECRET         — current mail-store secret (required)
 *   INGEST_ENDPOINT       — base URL of CF ingest worker, e.g. https://mail-ingest.tinytrashlabs.com (required)
 *   MM_BASE_URL           — Mattermost base URL (optional; skip alert if absent)
 *   MM_BOT_TOKEN          — MM bot PAT (optional)
 *   DRIFT_ALERT_CHANNEL   — MM channel name to ping on drift (default: it-help)
 *   CHECK_INTERVAL_MS     — how often to probe (default: 600000 = 10 min)
 */

import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

const INGEST_SECRET    = process.env.INGEST_SECRET;
const INGEST_ENDPOINT  = process.env.INGEST_ENDPOINT;
const MM_BASE_URL      = process.env.MM_BASE_URL;
const MM_BOT_TOKEN     = process.env.MM_BOT_TOKEN;
const ALERT_CHANNEL    = process.env.DRIFT_ALERT_CHANNEL || 'it-help';
const INTERVAL_MS      = parseInt(process.env.CHECK_INTERVAL_MS || '600000', 10);

if (!INGEST_SECRET || !INGEST_ENDPOINT) {
  console.error('[drift-guard] INGEST_SECRET and INGEST_ENDPOINT are required');
  process.exit(1);
}

function request(url, options, body) {
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

async function mmPost(message) {
  if (!MM_BASE_URL || !MM_BOT_TOKEN) return;
  try {
    // Resolve channel id by name
    const ch = await request(
      `${MM_BASE_URL}/api/v4/channels/name/${encodeURIComponent(ALERT_CHANNEL)}?team_name=ttl`,
      { method: 'GET', headers: { Authorization: `Bearer ${MM_BOT_TOKEN}` } }
    );
    if (ch.status !== 200) {
      // Fallback: try without team
      const ch2 = await request(
        `${MM_BASE_URL}/api/v4/channels/search`,
        { method: 'POST', headers: { Authorization: `Bearer ${MM_BOT_TOKEN}`, 'Content-Type': 'application/json' } },
        JSON.stringify({ term: ALERT_CHANNEL })
      );
      const channels = JSON.parse(ch2.body);
      if (!Array.isArray(channels) || !channels[0]?.id) {
        console.warn('[drift-guard] could not resolve MM channel for alert');
        return;
      }
      const channelId = channels[0].id;
      await request(
        `${MM_BASE_URL}/api/v4/posts`,
        { method: 'POST', headers: { Authorization: `Bearer ${MM_BOT_TOKEN}`, 'Content-Type': 'application/json' } },
        JSON.stringify({ channel_id: channelId, message })
      );
      return;
    }
    const channelId = JSON.parse(ch.body).id;
    await request(
      `${MM_BASE_URL}/api/v4/posts`,
      { method: 'POST', headers: { Authorization: `Bearer ${MM_BOT_TOKEN}`, 'Content-Type': 'application/json' } },
      JSON.stringify({ channel_id: channelId, message })
    );
  } catch (err) {
    console.warn('[drift-guard] MM alert failed:', err.message);
  }
}

let alertedAt = 0; // epoch ms of last drift alert (debounce — re-alert after 1hr)
const ALERT_DEBOUNCE_MS = 60 * 60 * 1000;

async function check() {
  try {
    const body = JSON.stringify({});
    const result = await request(
      `${INGEST_ENDPOINT}/ingest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${INGEST_SECRET}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      body
    );

    if (result.status === 400) {
      // 400 = secret accepted, body rejected (missing `raw`) → IN SYNC
      console.log(`[drift-guard] ${new Date().toISOString()} OK — secrets in sync (probe returned 400)`);
      alertedAt = 0; // reset debounce on recovery
    } else if (result.status === 401) {
      // DRIFT DETECTED
      const now = Date.now();
      console.error(`[drift-guard] ${new Date().toISOString()} DRIFT DETECTED — CF worker rejected INGEST_SECRET with 401`);
      if (now - alertedAt > ALERT_DEBOUNCE_MS) {
        alertedAt = now;
        await mmPost(
          `⚠️ **INGEST_SECRET drift detected** — mail-store and CF worker secrets are out of sync.\n` +
          `CF worker returned 401 on probe to \`${INGEST_ENDPOINT}\`.\n` +
          `Fix: re-sync the secret in Infisical and redeploy both services. ` +
          `Until fixed, incoming mail is being dropped.`
        );
      }
    } else {
      // Transient / unexpected
      console.warn(`[drift-guard] ${new Date().toISOString()} unexpected probe status ${result.status} — skipping`);
    }
  } catch (err) {
    console.warn(`[drift-guard] ${new Date().toISOString()} probe error: ${err.message}`);
  }
}

console.log(`[drift-guard] starting — probing ${INGEST_ENDPOINT} every ${INTERVAL_MS / 1000}s`);
check(); // run immediately on boot
setInterval(check, INTERVAL_MS);
