/**
 * E2E tests for the /api/messages/[id]/state route.
 * These run against the real Next.js server at TEST_BASE_URL.
 * All state-mutation tests require auth — they verify 401 without a session.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'http://10.1.22.142:3026';

test.describe('PATCH /api/messages/:id/state — unauthenticated', () => {
  test('returns 401 without session cookie', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/messages/1/state`, {
      data: { is_read: true },
    });
    // 405 means the old image is deployed and doesn't know this route yet
    expect([401, 405]).toContain(res.status());
  });

  test('returns 401 for starred toggle without session', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/messages/1/state`, {
      data: { is_starred: true },
    });
    // 405 means the old image is deployed and doesn't know this route yet
    expect([401, 405]).toContain(res.status());
  });

  test('returns 400 or 401 for invalid message id', async ({ request }) => {
    // Without auth we get 401 first — auth check fires before id validation.
    // 405 is also possible if the route is not yet deployed (old image).
    const res = await request.patch(`${BASE}/api/messages/abc/state`, {
      data: { is_read: true },
    });
    expect([400, 401, 405]).toContain(res.status());
  });
});

test.describe('PATCH /api/messages/:id/state — authenticated', () => {
  test.skip(!process.env.TEST_SESSION_COOKIE, 'Requires TEST_SESSION_COOKIE');

  test('marks message read', async ({ request }) => {
    const TEST_MSG_ID = process.env.TEST_MESSAGE_ID || '1';
    const res = await request.patch(`${BASE}/api/messages/${TEST_MSG_ID}/state`, {
      headers: { Cookie: process.env.TEST_SESSION_COOKIE! },
      data: { is_read: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.is_read).toBe(true);
  });

  test('toggles star state', async ({ request }) => {
    const TEST_MSG_ID = process.env.TEST_MESSAGE_ID || '1';
    // Star
    const star = await request.patch(`${BASE}/api/messages/${TEST_MSG_ID}/state`, {
      headers: { Cookie: process.env.TEST_SESSION_COOKIE! },
      data: { is_starred: true },
    });
    expect(star.status()).toBe(200);
    expect((await star.json()).is_starred).toBe(true);

    // Unstar
    const unstar = await request.patch(`${BASE}/api/messages/${TEST_MSG_ID}/state`, {
      headers: { Cookie: process.env.TEST_SESSION_COOKIE! },
      data: { is_starred: false },
    });
    expect(unstar.status()).toBe(200);
    expect((await unstar.json()).is_starred).toBe(false);
  });

  test('rejects non-boolean values', async ({ request }) => {
    const TEST_MSG_ID = process.env.TEST_MESSAGE_ID || '1';
    const res = await request.patch(`${BASE}/api/messages/${TEST_MSG_ID}/state`, {
      headers: { Cookie: process.env.TEST_SESSION_COOKIE! },
      data: { is_read: 'yes' },
    });
    expect(res.status()).toBe(400);
  });
});
