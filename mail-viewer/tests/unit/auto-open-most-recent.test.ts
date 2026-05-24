/**
 * Tests for the auto-open-most-recent guard logic from InboxClient.
 * Extracted as a pure function for testability.
 *
 * Guard rules:
 *  - Only fires when no message is currently selected.
 *  - Only fires when there is at least one threaded message.
 *  - Only fires on desktop (window.innerWidth >= 640).
 *  - Only fires once per mount (ref guard).
 */

interface AutoOpenInputs {
  alreadyFired: boolean;
  selectedMsgId: number | null;
  firstMsgId: number | undefined;
  innerWidth: number;
}

function shouldAutoOpen(inp: AutoOpenInputs): boolean {
  if (inp.alreadyFired) return false;
  if (inp.selectedMsgId != null) return false;
  if (inp.firstMsgId == null) return false;
  if (inp.innerWidth < 640) return false;
  return true;
}

describe('auto-open-most-recent guard', () => {
  const base: AutoOpenInputs = {
    alreadyFired: false,
    selectedMsgId: null,
    firstMsgId: 42,
    innerWidth: 1280,
  };

  it('fires on desktop with messages and no selection', () => {
    expect(shouldAutoOpen(base)).toBe(true);
  });

  it('does not fire if already fired once (ref guard)', () => {
    expect(shouldAutoOpen({ ...base, alreadyFired: true })).toBe(false);
  });

  it('does not fire when a message is already selected (direct link wins)', () => {
    expect(shouldAutoOpen({ ...base, selectedMsgId: 99 })).toBe(false);
  });

  it('does not fire when the threaded list is empty', () => {
    expect(shouldAutoOpen({ ...base, firstMsgId: undefined })).toBe(false);
  });

  it('does not fire on mobile (innerWidth below 640)', () => {
    expect(shouldAutoOpen({ ...base, innerWidth: 390 })).toBe(false);
  });

  it('fires at exactly the sm breakpoint (640)', () => {
    expect(shouldAutoOpen({ ...base, innerWidth: 640 })).toBe(true);
  });
});
