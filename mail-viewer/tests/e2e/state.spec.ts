/**
 * E2E tests for the /api/message-states/[id] route.
 *
 * Unauthenticated tests run against prod and expect 401.
 * If the route is not yet deployed the pre-flight returns false and tests are
 * skipped (explicit test.skip), so CI shows "skipped" not "failed" on old images.
 *
 * Authenticated tests require TEST_SESSION_COOKIE and TEST_MESSAGE_ID env vars.
 */
import { test, expect, APIRequestContext } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'http://10.1.22.142:3026';

/**
 * Pre-flight: returns true when /api/message-states/1 responds with 401
 * (route deployed, auth check fired). Returns false on 404/405 (not deployed)
 * or any network error. Any other status (e.g. 500) propagates as a test
 * failure rather than a silent skip.
 */
async function stateRouteDeployed(request: APIRequestContext): Promise<boolean> {
  const res = await request.patch(`${BASE}/api/message-states/1`, {
    data: { is_read: true },
  });
  const status = res.status();
  if (status === 401) return true;       // deployed, auth working
  if (status === 404 || status === 405) return false; // not deployed yet
  // Anything else (500, 502, etc.) is a real problem — fail loudly
  throw new Error(`State route pre-flight returned unexpected ${status} — check deployment`);
}

test.describe('PATCH /api/message-states/:id — unauthenticated', () => {
  test('returns 401 without session cookie', async ({ request }) => {
    const deployed = await stateRouteDeployed(request);
    test.skip(!deployed, 'State route not yet deployed on target server');

    const res = await request.patch(`${BASE}/api/message-states/1`, {
      data: { is_read: true },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 401 for starred toggle without session', async ({ request }) => {
    const deployed = await stateRouteDeployed(request);
    test.skip(!deployed, 'State route not yet deployed on target server');

    const res = await request.patch(`${BASE}/api/message-states/1`, {
      data: { is_starred: true },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 401 for non-numeric id (auth checked first)', async ({ request }) => {
    const deployed = await stateRouteDeployed(request);
    test.skip(!deployed, 'State route not yet deployed on target server');

    const res = await request.patch(`${BASE}/api/message-states/abc`, {
      data: { is_read: true },
    });
    // Auth fires before id parsing — 401 expected without session
    expect(res.status()).toBe(401);
  });
});

test.describe('PATCH /api/message-states/:id — authenticated', () => {
  test.skip(!process.env.TEST_SESSION_COOKIE, 'Requires TEST_SESSION_COOKIE');

  test('marks message read', async ({ request }) => {
    const TEST_MSG_ID = process.env.TEST_MESSAGE_ID || '1';
    const res = await request.patch(`${BASE}/api/message-states/${TEST_MSG_ID}`, {
      headers: { Cookie: process.env.TEST_SESSION_COOKIE! },
      data: { is_read: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.is_read).toBe(true);
  });

  test('toggles star state', async ({ request }) => {
    const TEST_MSG_ID = process.env.TEST_MESSAGE_ID || '1';
    const star = await request.patch(`${BASE}/api/message-states/${TEST_MSG_ID}`, {
      headers: { Cookie: process.env.TEST_SESSION_COOKIE! },
      data: { is_starred: true },
    });
    expect(star.status()).toBe(200);
    expect((await star.json()).is_starred).toBe(true);

    const unstar = await request.patch(`${BASE}/api/message-states/${TEST_MSG_ID}`, {
      headers: { Cookie: process.env.TEST_SESSION_COOKIE! },
      data: { is_starred: false },
    });
    expect(unstar.status()).toBe(200);
    expect((await unstar.json()).is_starred).toBe(false);
  });

  test('rejects non-boolean values', async ({ request }) => {
    const TEST_MSG_ID = process.env.TEST_MESSAGE_ID || '1';
    const res = await request.patch(`${BASE}/api/message-states/${TEST_MSG_ID}`, {
      headers: { Cookie: process.env.TEST_SESSION_COOKIE! },
      data: { is_read: 'yes' },
    });
    expect(res.status()).toBe(400);
  });
});
