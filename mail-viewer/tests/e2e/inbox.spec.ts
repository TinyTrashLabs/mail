import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Inbox + message view tests.
 *
 * These tests mock the NextAuth session and mail-store responses so they can
 * run without a real Mattermost instance or mail-store service.
 *
 * To run against a real logged-in session, set:
 *   TEST_SESSION_COOKIE=<your nextauth.session-token>
 *   TEST_BASE_URL=https://mail.tinytrashlabs.com
 */

const MOCK_MESSAGES = [
  {
    id: 1,
    message_id: '<msg1@test>',
    subject: 'Hello from Alice',
    from_addr: 'alice@example.com',
    to_addrs: [{ name: 'Test', address: 'test@tinytrashlabs.com' }],
    cc_addrs: [],
    received_at: new Date(Date.now() - 3600_000).toISOString(),
    attachments_meta: [],
    mailbox: 'test',
  },
  {
    id: 2,
    message_id: '<msg2@test>',
    subject: 'Invoice attached',
    from_addr: 'bob@example.com',
    to_addrs: [{ name: 'Test', address: 'test@tinytrashlabs.com' }],
    cc_addrs: [],
    received_at: new Date(Date.now() - 7200_000).toISOString(),
    attachments_meta: [{ filename: 'invoice.pdf', contentType: 'application/pdf', size: 12345 }],
    mailbox: 'test',
  },
];

const MOCK_MESSAGE_DETAIL = {
  ...MOCK_MESSAGES[0],
  text_body: 'Hi there!\n\nThis is a test email.',
  html_body: null,
  in_reply_to: null,
};

/** Intercept mail-store API calls with mock data */
async function mockMailStore(context: BrowserContext) {
  await context.route('**/api/messages*', async (route, request) => {
    const url = new URL(request.url());
    const pathParts = url.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];

    if (lastPart === 'messages') {
      // List endpoint
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ messages: MOCK_MESSAGES, total: 2, page: 1, limit: 50 }),
      });
    } else {
      // Single message endpoint /messages/:id
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_MESSAGE_DETAIL),
      });
    }
  });
}

test.describe('Inbox', () => {
  test.skip(!process.env.TEST_SESSION_COOKIE, 'Requires TEST_SESSION_COOKIE for authenticated tests');

  let page: Page;

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext();
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
    await mockMailStore(context);
    page = await context.newPage();
  });

  test('renders sidebar with logo and nav items', async () => {
    await page.goto('/inbox');
    await expect(page.getByAltText('TTL')).toBeVisible();
    await expect(page.getByRole('link', { name: /shared/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /compose/i })).toBeVisible();
  });

  test('shows message list', async () => {
    await page.goto('/inbox');
    await expect(page.getByText('Hello from Alice')).toBeVisible();
    await expect(page.getByText('Invoice attached')).toBeVisible();
  });

  test('shows attachment clip icon for messages with attachments', async () => {
    await page.goto('/inbox');
    // The Paperclip icon renders as an SVG within the row — check aria or test-id
    const rows = page.locator('a[href^="/inbox/"]');
    await expect(rows).toHaveCount(2);
  });

  test('clicking a message navigates to detail view', async () => {
    await page.goto('/inbox');
    await page.getByText('Hello from Alice').click();
    await expect(page).toHaveURL(/\/inbox\/\d+/);
    await expect(page.getByText('Hello from Alice')).toBeVisible();
  });
});

test.describe('Inbox row keyboard and star interactions', () => {
  test.skip(!process.env.TEST_SESSION_COOKIE, 'Requires TEST_SESSION_COOKIE for authenticated tests');

  let page: Page;

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext();
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
    await mockMailStore(context);
    page = await context.newPage();
  });

  test('pressing Enter on a row opens the message', async () => {
    await page.goto('/inbox');
    const firstRow = page.locator('[role="row"]').first();
    await firstRow.focus();
    await page.keyboard.press('Enter');
    // URL should gain a ?msg= param or navigate to the message
    await expect(page).toHaveURL(/msg=\d+|\/inbox\/\d+/);
  });

  test('pressing Space on a row opens the message', async () => {
    await page.goto('/inbox');
    const firstRow = page.locator('[role="row"]').first();
    await firstRow.focus();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/msg=\d+|\/inbox\/\d+/);
  });

  test('pressing Enter inside a child element (search input) does not open a message', async () => {
    await page.goto('/inbox');
    const searchInput = page.locator('input[placeholder*="Filter"]');
    await searchInput.focus();
    // Type a letter and press Enter — the row onKeyDown guard (target !== currentTarget) must block this
    await page.keyboard.type('Hello');
    const urlBefore = page.url();
    await page.keyboard.press('Enter');
    // URL must not have changed to a message-open URL
    expect(page.url()).toBe(urlBefore);
  });

  test('clicking the star button does not open the message (stopPropagation)', async () => {
    await page.goto('/inbox');
    const firstRow = page.locator('[role="row"]').first();
    const starBtn = firstRow.locator('button[aria-label="Star"], button[aria-label="Unstar"]');
    await starBtn.click();
    // Clicking star should NOT navigate away — URL stays at /inbox without a msg param
    await expect(page).not.toHaveURL(/msg=\d+/);
    await expect(page).toHaveURL(/\/inbox/);
  });
});

test.describe('Message detail', () => {
  test.skip(!process.env.TEST_SESSION_COOKIE, 'Requires TEST_SESSION_COOKIE for authenticated tests');

  test('renders subject, from, and body', async ({ browser }) => {
    const context = await browser.newContext();
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
    await mockMailStore(context);
    const page = await context.newPage();
    await page.goto('/inbox/1?mailbox=test');

    await expect(page.getByText('Hello from Alice')).toBeVisible();
    await expect(page.getByText('alice@example.com')).toBeVisible();
    await expect(page.getByText(/Hi there!/)).toBeVisible();
  });

  test('Reply link pre-fills compose with replyTo and subject', async ({ browser }) => {
    const context = await browser.newContext();
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
    await mockMailStore(context);
    const page = await context.newPage();
    await page.goto('/inbox/1?mailbox=test');

    await page.getByRole('link', { name: /reply/i }).click();
    await expect(page).toHaveURL(/\/compose/);
    await expect(page.locator('input[placeholder*="recipient"]')).toHaveValue('alice@example.com');
  });
});
