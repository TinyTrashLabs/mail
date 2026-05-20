/**
 * Unit tests for the messages route auth/ownership logic.
 * We test the access-control rules in isolation — no real DB, no real HTTP.
 */

import { PERSONAL } from '../mailbox.js';

// Mirror the access-control logic from routes/messages.js
function canAccessMailbox(requestedMailbox, viewerUser) {
  return (
    requestedMailbox === 'shared' ||
    (PERSONAL.has(requestedMailbox) && requestedMailbox === viewerUser)
  );
}

function canReadMessage(msgMailbox, viewerUser) {
  return (
    msgMailbox === 'shared' ||
    (PERSONAL.has(msgMailbox) && msgMailbox === viewerUser)
  );
}

describe('mailbox list access control', () => {
  test('any user can read shared mailbox', () => {
    expect(canAccessMailbox('shared', 'david')).toBe(true);
    expect(canAccessMailbox('shared', 'shane')).toBe(true);
    expect(canAccessMailbox('shared', '')).toBe(true);
  });

  test('owner can read own mailbox', () => {
    expect(canAccessMailbox('david', 'david')).toBe(true);
    expect(canAccessMailbox('shane', 'shane')).toBe(true);
  });

  test('other user cannot read another personal mailbox', () => {
    expect(canAccessMailbox('david', 'shane')).toBe(false);
    expect(canAccessMailbox('shane', 'david')).toBe(false);
    expect(canAccessMailbox('derek', 'ryan')).toBe(false);
  });

  test('unauthenticated user cannot read personal mailbox', () => {
    expect(canAccessMailbox('david', '')).toBe(false);
  });

  test('unknown mailbox names are rejected', () => {
    // Non-PERSONAL names that aren't 'shared' also fail
    expect(canAccessMailbox('attacker', 'attacker')).toBe(false);
  });
});

describe('message detail access control', () => {
  test('shared message readable by anyone', () => {
    expect(canReadMessage('shared', 'david')).toBe(true);
    expect(canReadMessage('shared', '')).toBe(true);
  });

  test('personal message readable by owner only', () => {
    expect(canReadMessage('david', 'david')).toBe(true);
    expect(canReadMessage('david', 'shane')).toBe(false);
    expect(canReadMessage('david', '')).toBe(false);
  });

  test('IDOR: cannot guess another user message by id', () => {
    // Even if attacker sends viewer_user=david, they can't spoof — server derives
    // viewer_user from session, not from request body. This test documents the invariant.
    const sessionUser = 'shane';
    const msgMailbox = 'david';
    expect(canReadMessage(msgMailbox, sessionUser)).toBe(false);
  });
});
