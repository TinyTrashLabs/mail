/**
 * Unit tests for the dwell-timer + mark-unread cancel logic from
 * InboxClient. The actual hook lives inside the React component; this file
 * extracts the pure timer choreography so we can exercise it without a
 * jsdom + React Testing Library setup.
 *
 * Behaviors under test:
 *  - Selecting a message schedules a mark-read after READ_DWELL_MS.
 *  - Changing selection clears the pending timer.
 *  - markUnread cancels the pending timer.
 *  - The timer re-checks state at fire time (so a state change after
 *    scheduling but before firing does not get clobbered).
 *  - Selecting an already-read message does not schedule a timer.
 */

type State = { is_read: boolean; is_starred: boolean; is_trashed: boolean };

const READ_DWELL_MS = 2000;

function makeDwellController() {
  const states = new Map<number, State>();
  const statesRef = { current: states };
  const getLatest = (id: number): State =>
    statesRef.current.get(id) ?? { is_read: false, is_starred: false, is_trashed: false };

  const patches: Array<{ id: number; patch: Partial<State> }> = [];
  const patchState = (id: number, patch: Partial<State>) => {
    patches.push({ id, patch });
    const pre = getLatest(id);
    statesRef.current.set(id, { ...pre, ...patch });
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  let selected: number | null = null;

  function select(id: number | null) {
    if (timer) { clearTimeout(timer); timer = null; }
    selected = id;
    if (id == null) return;
    if (getLatest(id).is_read) return;
    timer = setTimeout(() => {
      // re-check at fire time
      if (selected === id && !getLatest(id).is_read) {
        patchState(id, { is_read: true });
      }
      timer = null;
    }, READ_DWELL_MS);
  }

  function markUnread(id: number) {
    patchState(id, { is_read: false });
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function setReadDirect(id: number, val: boolean) {
    const pre = getLatest(id);
    statesRef.current.set(id, { ...pre, is_read: val });
  }

  return {
    select,
    markUnread,
    setReadDirect,
    getPatches: () => patches,
    hasPendingTimer: () => timer !== null,
    getLatest,
  };
}

describe('dwell-mark-read timer', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('marks read after 2s dwell on an unread message', () => {
    const c = makeDwellController();
    c.select(1);
    expect(c.hasPendingTimer()).toBe(true);
    jest.advanceTimersByTime(READ_DWELL_MS);
    expect(c.getLatest(1).is_read).toBe(true);
    expect(c.getPatches()).toEqual([{ id: 1, patch: { is_read: true } }]);
  });

  it('does not schedule when the message is already read', () => {
    const c = makeDwellController();
    c.setReadDirect(1, true);
    c.select(1);
    expect(c.hasPendingTimer()).toBe(false);
    jest.advanceTimersByTime(READ_DWELL_MS * 2);
    expect(c.getPatches()).toEqual([]);
  });

  it('cancels the pending timer when selection changes', () => {
    const c = makeDwellController();
    c.select(1);
    jest.advanceTimersByTime(500);
    c.select(2);
    jest.advanceTimersByTime(READ_DWELL_MS - 500);
    // Original timer for id=1 must not have fired
    expect(c.getLatest(1).is_read).toBe(false);
    // id=2 still pending
    expect(c.hasPendingTimer()).toBe(true);
  });

  it('cancels the pending timer when markUnread fires before dwell expires', () => {
    const c = makeDwellController();
    c.select(1);
    jest.advanceTimersByTime(1000);
    c.markUnread(1);
    jest.advanceTimersByTime(READ_DWELL_MS);
    expect(c.getLatest(1).is_read).toBe(false);
    // Only the explicit markUnread patch should be recorded
    expect(c.getPatches()).toEqual([{ id: 1, patch: { is_read: false } }]);
  });

  it('does not clobber a state change that happens between schedule and fire (via latest-state ref)', () => {
    const c = makeDwellController();
    c.select(1);
    // Simulate something else flipping is_read (e.g. user pressed Shift+U
    // and only the state mutated, didn't clear timer for whatever reason).
    // The fire-time re-check via the ref should bail out.
    jest.advanceTimersByTime(500);
    c.setReadDirect(1, true);
    // Now flip back to unread without resetting the timer
    c.setReadDirect(1, false);
    // Wait, that does still flow into the timer. The real guarantee we want:
    // if state says read at fire time, no patch is emitted.
    c.setReadDirect(1, true);
    jest.advanceTimersByTime(READ_DWELL_MS);
    // Timer fired but observed is_read=true at fire time → no patch
    expect(c.getPatches()).toEqual([]);
  });
});
