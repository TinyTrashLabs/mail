'use client';

/**
 * StandaloneMessageActions — used on the full-page message detail route
 * (`/inbox/[id]`) where there's no surrounding InboxClient to own state.
 *
 * Owns its own `starred` / `trashed` state, fires the same PATCH endpoint as
 * the inbox-pane variant, and on mark-unread navigates back to the list.
 * The mark-read-on-mount used to live here too — we drop it because the
 * inbox view already marks read after a 2s dwell when you select a row, and
 * full-page direct-link visits to /inbox/[id] are explicit "I want to read
 * this" actions where instant mark-read is the right behavior.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageActions } from './MessageActions';

async function patchState(
  messageId: number,
  patch: Record<string, boolean>
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/message-states/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

interface StandaloneProps {
  messageId: number;
  initialStarred: boolean;
  initialRead: boolean;
  initialTrashed: boolean;
  replyHref: string;
  backHref: string;
}

export function StandaloneMessageActions({
  messageId,
  initialStarred,
  initialRead,
  initialTrashed,
  replyHref,
  backHref,
}: StandaloneProps) {
  const router = useRouter();
  const [starred, setStarred] = useState(initialStarred);
  const [trashed, setTrashed] = useState(initialTrashed);

  // Mark read on mount when arriving via direct link (full-page view).
  useEffect(() => {
    if (initialRead) return;
    patchState(messageId, { is_read: true });
  }, [messageId, initialRead]);

  const onToggleStar = useCallback(async (id: number) => {
    const next = !starred;
    setStarred(next);
    const ok = await patchState(id, { is_starred: next });
    if (!ok) setStarred(!next);
  }, [starred]);

  const onMarkUnread = useCallback(async (id: number) => {
    const ok = await patchState(id, { is_read: false });
    if (ok) router.push(backHref);
  }, [router, backHref]);

  const onToggleTrash = useCallback(async (id: number) => {
    const next = !trashed;
    setTrashed(next);
    const ok = await patchState(id, { is_trashed: next });
    if (!ok) {
      setTrashed(!next);
      return;
    }
    if (next) router.push(backHref);
  }, [trashed, router, backHref]);

  return (
    <MessageActions
      messageId={messageId}
      starred={starred}
      trashed={trashed}
      replyHref={replyHref}
      backHref={backHref}
      onToggleStar={onToggleStar}
      onMarkUnread={onMarkUnread}
      onToggleTrash={onToggleTrash}
    />
  );
}
