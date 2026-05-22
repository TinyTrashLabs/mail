// Manual judging harness — drives the live mail viewer end-to-end using a
// forged NextAuth session cookie (no OAuth roundtrip needed), captures
// screenshots and HTML at every surface, and dumps a verdict summary.
//
// Why forge the cookie? Driving MM OAuth from headless chromium against a
// React SPA is brittle (hydration timing, CSP, etc). The viewer accepts any
// NextAuth-signed session, so we mint one directly and skip MM entirely.
// The viewer's own auth → mail-store leg is still exercised (via
// VIEWER_SECRET-signed X-Viewer-User header).
//
// Requirements: NEXTAUTH_SECRET in env, MM_TEST_USER (cosmetic — what
// username the forged session claims), TTL_TAILNET_IP for the host-resolver.

import { test } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ART = join(process.cwd(), 'test-results', 'judge');
mkdirSync(ART, { recursive: true });

const VIEWER = 'https://mail.tinytrashlabs.com';
const VIEWER_HOST = 'mail.tinytrashlabs.com';
const SECRET = process.env.NEXTAUTH_SECRET!;
const USER = process.env.MM_TEST_USER || 'mailtest';

async function snap(page: any, name: string) {
  await page.screenshot({ path: join(ART, `${name}.png`), fullPage: true });
  const html = await page.content();
  writeFileSync(join(ART, `${name}.html`), html);
  const url = page.url();
  writeFileSync(join(ART, `${name}.url`), url);
  const text = await page.evaluate(() => (document.body?.innerText || '').slice(0, 6000));
  writeFileSync(join(ART, `${name}.txt`), text);
  console.log(`[snap] ${name} → ${url} (text=${text.length}b, html=${html.length}b)`);
}

test('judge: forged-session walkthrough', async ({ page, context }) => {
  test.setTimeout(180_000);

  // Mint NextAuth v4 session JWE for "mailtest"
  const token = await encode({
    token: {
      name: USER,
      username: USER,
      email: `${USER}@tinytrashlabs.com`,
      picture: null,
      sub: USER,
    },
    secret: SECRET,
    maxAge: 30 * 60,
  });
  await context.addCookies([
    {
      name: '__Secure-next-auth.session-token',
      value: token,
      domain: VIEWER_HOST,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  // 1. Inbox shared
  await page.goto(`${VIEWER}/inbox?mailbox=shared`, { waitUntil: 'networkidle' });
  await snap(page, '01-inbox-shared');

  // 2. Each message detail (HTML, plain, sentry-style, short note, newsletter)
  for (const id of [1, 2, 3, 4, 5, 6]) {
    await page.goto(`${VIEWER}/inbox/${id}?mailbox=shared`, { waitUntil: 'networkidle' });
    await snap(page, `02-message-${id}`);
  }

  // 3. Compose page
  await page.goto(`${VIEWER}/compose`, { waitUntil: 'networkidle' });
  await snap(page, '03-compose-empty');

  // Fill in the compose form to see populated state
  const toInput = page.locator('input[name="to"], input[placeholder*="to" i]').first();
  const subjInput = page.locator('input[name="subject"], input[placeholder*="subject" i]').first();
  const bodyInput = page.locator('textarea, [contenteditable=true]').first();
  if (await toInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await toInput.fill('david@tinytrashlabs.com');
    await subjInput.fill('e2e test from patch — judge harness');
    await bodyInput.fill('David — this email was composed in the live mail viewer by a Playwright harness signed in as a forged NextAuth session for the throwaway mailtest user. If you see it in your inbox, the outbound (Resend) path works end-to-end.\n\nPatch');
    await snap(page, '04-compose-filled');
  }

  // 4. AI search bar (if visible on inbox)
  await page.goto(`${VIEWER}/inbox?mailbox=shared`, { waitUntil: 'networkidle' });
  const searchBar = page.getByPlaceholder(/search/i).first();
  if (await searchBar.isVisible({ timeout: 5000 }).catch(() => false)) {
    await searchBar.fill('builds that succeeded today');
    await snap(page, '05-search-typed');
    await searchBar.press('Enter').catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await snap(page, '06-search-results');
  }

  // 5. Try the AI summarize feature on a message (PR #8 shipped this)
  await page.goto(`${VIEWER}/inbox/4?mailbox=shared`, { waitUntil: 'networkidle' });
  const summarizeBtn = page.getByRole('button', { name: /summari[sz]e|tl;?dr|ai/i }).first();
  if (await summarizeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await snap(page, '07-summarize-button-visible');
    await summarizeBtn.click();
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await snap(page, '08-summarize-result');
  }

  // 6. Personal mailbox attempt (mailtest is not in PERSONAL — should refuse or fall back)
  await page.goto(`${VIEWER}/inbox?mailbox=mailtest`, { waitUntil: 'networkidle' });
  await snap(page, '09-personal-mailbox-attempt');

  // 7. Dark mode probe (if class toggles via prefers-color-scheme)
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${VIEWER}/inbox?mailbox=shared`, { waitUntil: 'networkidle' });
  await snap(page, '10-darkmode-inbox');
  await page.goto(`${VIEWER}/inbox/2?mailbox=shared`, { waitUntil: 'networkidle' });
  await snap(page, '11-darkmode-message');
});
