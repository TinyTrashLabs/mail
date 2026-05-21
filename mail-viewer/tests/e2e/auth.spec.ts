import { test, expect } from '@playwright/test';

/**
 * Auth flow tests.
 * These tests run against a live instance (TEST_BASE_URL).
 * They verify redirect behaviour without actually logging in
 * (no test credentials in CI — see README for local E2E setup).
 */

test.describe('Authentication', () => {
  test('unauthenticated / redirects to signin', async ({ page }) => {
    await page.goto('/');
    // Root should redirect to /inbox or show a sign-in prompt
    await expect(page).toHaveURL(/\/(api\/auth\/signin|inbox)/);
  });

  test('unauthenticated /inbox redirects to signin', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page).toHaveURL(/api\/auth\/signin/);
  });

  test('unauthenticated /compose redirects to signin', async ({ page }) => {
    await page.goto('/compose');
    await expect(page).toHaveURL(/api\/auth\/signin/);
  });

  test('signin page contains Mattermost OAuth button', async ({ page }) => {
    await page.goto('/api/auth/signin');
    // NextAuth renders a sign-in button for each provider
    const mmButton = page.getByRole('button', { name: /mattermost/i })
      .or(page.getByRole('link', { name: /mattermost/i }))
      .or(page.locator('form[action*="mattermost"]'));
    await expect(mmButton.first()).toBeVisible({ timeout: 5000 });
  });
});
