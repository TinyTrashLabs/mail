'use client';

/**
 * MessageActions — client component mounted on the message detail page.
 * Responsibilities:
 *  - Auto-marks message as read on mount (fire-and-forget) when entering for
 *    the first time. Suppressed when user explicitly marked unread (we don't
 *    want the auto-read to immediately undo their action).
 *  - Star toggle, mark-unread, and trash buttons.
 *  - Keyboard shortcuts: 'r' reply, 's' star, 'u' back, '#' / Delete trash,
 *    'U' (shift+u) mark unread.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Trash2, MailOpen, RotateCcw } from 'lucide-react';

interface MessageActionsProps {
  messageId: number;
  initialStarred: boolean;
  initialRead: boolean;
  initialTrashed: boolean;
  replyHref: string;
  backHref: string;
}

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

export function MessageActions({
  messageId,
  initialStarred,
  initialRead,
  initialTrashed,
  replyHref,
  backHref,
}: MessageActionsProps) {
  const router = useRouter();
  const [starred, setStarred] = useState(initialStarred);
  const [trashed, setTrashed] = useState(initialTrashed);
  const userMarkedUnread = useRef(false);

  // Auto-mark read on mount — skip if already read OR if the user has clicked
  // mark-unread during this view (otherwise we'd race the user's action).
  useEffect(() => {
    if (initialRead) return;
    if (userMarkedUnread.current) return;
    patchState(messageId, { is_read: true });
  }, [messageId, initialRead]);

  const toggleStar = useCallback(async () => {
    const next = !starred;
    setStarred(next);
    const ok = await patchState(messageId, { is_starred: next });
    if (!ok) setStarred(!next);
  }, [messageId, starred]);

  const markUnread = useCallback(async () => {
    userMarkedUnread.current = true;
    const ok = await patchState(messageId, { is_read: false });
    if (ok) {
      // Navigate back to the list — the user marked it unread because they
      // want to come back to it later, so getting out of the detail view is
      // the right next move.
      router.push(backHref);
    }
  }, [messageId, router, backHref]);

  const toggleTrash = useCallback(async () => {
    const next = !trashed;
    setTrashed(next);
    const ok = await patchState(messageId, { is_trashed: next });
    if (!ok) {
      setTrashed(!next);
      return;
    }
    // On trash, bounce back to inbox — message is gone from the current
    // view. On untrash (restoring from trash), stay put.
    if (next) router.push(backHref);
  }, [messageId, trashed, router, backHref]);

  // Keyboard shortcuts on detail page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // shift+U = mark unread (gmail uses shift+u for the same action)
      if (e.key === 'U' && e.shiftKey) {
        e.preventDefault();
        markUnread();
        return;
      }
      switch (e.key) {
        case 'r':
          router.push(replyHref);
          break;
        case 's':
          toggleStar();
          break;
        case 'u':
          // 'u' = back to inbox (Gmail convention); Backspace omitted — too
          // easy to trigger accidentally when user thinks focus is elsewhere
          router.push(backHref);
          break;
        case '#':
        case 'Delete':
          e.preventDefault();
          toggleTrash();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, replyHref, backHref, toggleStar, toggleTrash, markUnread]);

  const buttonCls =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-card text-sm font-sans transition-colors hover:bg-rule min-h-[36px]';

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        onClick={toggleStar}
        title={starred ? 'Unstar (s)' : 'Star (s)'}
        className={buttonCls}
      >
        <Star
          size={14}
          strokeWidth={1.5}
          className={`transition-colors ${
            starred ? 'fill-[#d8a14a] text-[#d8a14a]' : 'text-ink-soft'
          }`}
        />
        <span className={starred ? 'text-[#d8a14a]' : 'text-ink-soft'}>
          {starred ? 'Starred' : 'Star'}
        </span>
      </button>

      <button
        onClick={markUnread}
        title="Mark as unread (shift+U)"
        className={buttonCls}
      >
        <MailOpen size={14} strokeWidth={1.5} className="text-ink-soft" />
        <span className="text-ink-soft">Mark unread</span>
      </button>

      <button
        onClick={toggleTrash}
        title={trashed ? 'Restore (#)' : 'Move to trash (#)'}
        className={buttonCls}
      >
        {trashed ? (
          <>
            <RotateCcw size={14} strokeWidth={1.5} className="text-ink-soft" />
            <span className="text-ink-soft">Restore</span>
          </>
        ) : (
          <>
            <Trash2 size={14} strokeWidth={1.5} className="text-ink-soft" />
            <span className="text-ink-soft">Trash</span>
          </>
        )}
      </button>
    </div>
  );
}
