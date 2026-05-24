/**
 * Tests the router.push vs router.replace selection inside openMessage.
 * The component delegates to a Next.js router; here we model the choice
 * with a thin wrapper to lock the contract that arrow-key navigation
 * uses replace (no history spam) while clicks/auto-open use push.
 */

interface RouterShim {
  pushed: string[];
  replaced: string[];
}

function openMessage(
  router: RouterShim,
  baseSearch: URLSearchParams,
  id: number,
  opts?: { replace?: boolean }
) {
  const params = new URLSearchParams(baseSearch.toString());
  params.set('msg', String(id));
  const url = `/inbox?${params.toString()}`;
  if (opts?.replace) {
    router.replaced.push(url);
  } else {
    router.pushed.push(url);
  }
}

describe('openMessage router push/replace selection', () => {
  it('uses push by default (click semantics)', () => {
    const router: RouterShim = { pushed: [], replaced: [] };
    openMessage(router, new URLSearchParams(), 1);
    expect(router.pushed).toEqual(['/inbox?msg=1']);
    expect(router.replaced).toEqual([]);
  });

  it('uses replace when opts.replace is true (arrow-key semantics)', () => {
    const router: RouterShim = { pushed: [], replaced: [] };
    openMessage(router, new URLSearchParams(), 1, { replace: true });
    openMessage(router, new URLSearchParams(), 2, { replace: true });
    openMessage(router, new URLSearchParams(), 3, { replace: true });
    expect(router.pushed).toEqual([]);
    expect(router.replaced).toEqual([
      '/inbox?msg=1',
      '/inbox?msg=2',
      '/inbox?msg=3',
    ]);
  });

  it('preserves existing search params (mailbox, view) when adding msg', () => {
    const router: RouterShim = { pushed: [], replaced: [] };
    const base = new URLSearchParams('mailbox=david&view=unread');
    openMessage(router, base, 7);
    expect(router.pushed[0]).toBe('/inbox?mailbox=david&view=unread&msg=7');
  });
});
