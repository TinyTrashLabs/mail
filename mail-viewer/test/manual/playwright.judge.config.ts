// Standalone Playwright config for the on-demand "judge look-and-feel" harness.
// Pins DNS for mail.tinytrashlabs.com to the tailnet IP so this works from any
// host that can reach the tailnet (workspace container, prod box, etc.) without
// depending on split-DNS.
import { defineConfig, devices } from '@playwright/test';

// tailnet IP of ttl-prod-01 (Caddy binds mail.tinytrashlabs.com here).
const TAILNET_IP = process.env.TTL_TAILNET_IP || '100.112.206.78';
const VIEWER_HOST = 'mail.tinytrashlabs.com';
const MM_HOST = 'mm.tinytrashlabs.com';

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  reporter: [['list']],
  workers: 1,
  use: {
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      // Use the system chromium (apk-installed) — Playwright's bundled binary
      // is built against glibc and won't run on Alpine/musl. Override via
      // PLAYWRIGHT_CHROMIUM_EXECUTABLE if you have a different build.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // Pin only the viewer hostname to the tailnet IP (Caddy listens
        // there). MM is served via public Cloudflare Tunnel — must NOT be
        // pinned, let it resolve via public DNS.
        `--host-resolver-rules=MAP ${VIEWER_HOST} ${TAILNET_IP}`,
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
