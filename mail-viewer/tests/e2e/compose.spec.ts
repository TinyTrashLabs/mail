import { test, expect } from '@playwright/test';

/**
 * Compose page tests.
 * Authenticated tests require TEST_SESSION_COOKIE.
 */

test.describe('Compose (unauthenticated)', () => {
  test('redirects to signin when not authenticated', async ({ page }) => {
    await page.goto('/compose');
    await expect(page).toHaveURL(/api\/auth\/signin/);
  });
});

test.describe('Compose (authenticated)', () => {
  test.skip(!process.env.TEST_SESSION_COOKIE, 'Requires TEST_SESSION_COOKIE');

  test.beforeEach(async ({ context }) => {
    if (process.env.TEST_SESSION_COOKIE) {
      await context.addCookies([{
        name: 'next-auth.session-token',
        value: process.env.TEST_SESSION_COOKIE,
        domain: new URL(process.env.TEST_BASE_URL || 'http://localhost:3000').hostname,
        path: '/',
        httpOnly: true,
        secure: false,
      }]);
    }
  });

  test('renders compose form with To, Subject, and Body fields', async ({ page }) => {
    await page.goto('/compose');
    await expect(page.locator('input[placeholder*="recipient"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Subject"]')).toBeVisible();
    await expect(page.locator('[contenteditable="true"]')).toBeVisible();
  });

  test('Send button is disabled when fields are empty', async ({ page }) => {
    await page.goto('/compose');
    const sendBtn = page.getByRole('button', { name: /send/i });
    await expect(sendBtn).toBeDisabled();
  });

  test('Send button enables when all fields are filled', async ({ page }) => {
    await page.goto('/compose');
    await page.locator('input[placeholder*="recipient"]').fill('test@example.com');
    await page.locator('input[placeholder="Subject"]').fill('Test subject');
    await page.locator('[contenteditable="true"]').fill('Test body content');
    const sendBtn = page.getByRole('button', { name: /send/i });
    await expect(sendBtn).toBeEnabled();
  });

  test('pre-fills To and Subject when query params are set', async ({ page }) => {
    const replyTo = encodeURIComponent('alice@example.com');
    const subject = encodeURIComponent('Re: Hello');
    await page.goto(`/compose?replyTo=${replyTo}&subject=${subject}`);
    await expect(page.locator('input[placeholder*="recipient"]')).toHaveValue('alice@example.com');
    await expect(page.locator('input[placeholder="Subject"]')).toHaveValue('Re: Hello');
  });

  test('Discard navigates back', async ({ page }) => {
    await page.goto('/inbox');
    await page.goto('/compose');
    await page.getByRole('button', { name: /discard/i }).click();
    // Should navigate back (to inbox or wherever back goes)
    await expect(page).not.toHaveURL(/\/compose/);
  });

  test('shows sidebar with TTL logo', async ({ page }) => {
    await page.goto('/compose');
    await expect(page.getByAltText('TTL')).toBeVisible();
  });
});
