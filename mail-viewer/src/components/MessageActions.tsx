'use client';

/**
 * MessageActions — client component mounted in the reading pane toolbar.
 *
 * Responsibilities:
 *  - Render star / mark-unread / trash buttons.
 *  - Wire keyboard shortcuts for the reading-pane context: 'r' reply, 's' star,
 *    'u' back to list, '#' / Delete trash, shift+U mark unread.
 *
 * State ownership: this component is intentionally STATELESS w.r.t. the
 * message's read/starred/trashed flags. The parent (InboxClient) owns the
 * authoritative state map for every visible row and passes the current
 * snapshot in via props. Actions call back to the parent which does the
 * optimistic update + PATCH. That way the row in the left pane re-renders
 * the moment the user clicks something here — no router refresh required.
 *
 * Auto-mark-read on dwell is handled by the parent (InboxClient) too, not
 * here — it has the timer so it can cancel when the user clicks away.
 */

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Trash2, MailOpen, RotateCcw } from 'lucide-react';

interface MessageActionsProps {
  messageId: number;
  starred: boolean;
  trashed: boolean;
  replyHref: string;
  backHref: string;
  onToggleStar: (id: number) => void;
  onMarkUnread: (id: number) => void;
  onToggleTrash: (id: number) => void;
}

export function MessageActions({
  messageId,
  starred,
  trashed,
  replyHref,
  backHref,
  onToggleStar,
  onMarkUnread,
  onToggleTrash,
}: MessageActionsProps) {
  const router = useRouter();

  const toggleStar = useCallback(() => onToggleStar(messageId), [messageId, onToggleStar]);
  const markUnread = useCallback(() => onMarkUnread(messageId), [messageId, onMarkUnread]);
  const toggleTrash = useCallback(() => onToggleTrash(messageId), [messageId, onToggleTrash]);

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
    'flex items-center gap-1 px-2 py-1.5 rounded-card text-xs font-sans transition-colors hover:bg-rule whitespace-nowrap flex-shrink-0';

  return (
    <div className="flex items-center gap-0.5 flex-nowrap">
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
