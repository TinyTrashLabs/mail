'use client';

/**
 * MessageActions — client component mounted on the message detail page.
 * Responsibilities:
 *  - Auto-marks message as read on mount (fire-and-forget)
 *  - Provides star toggle button in the toolbar
 *  - Keyboard shortcut: 'r' → reply, 's' → toggle star, Backspace/u → back
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';

interface MessageActionsProps {
  messageId: number;
  initialStarred: boolean;
  initialRead: boolean;
  replyHref: string;
  backHref: string;
}

export function MessageActions({
  messageId,
  initialStarred,
  initialRead,
  replyHref,
  backHref,
}: MessageActionsProps) {
  const router = useRouter();
  const [starred, setStarred] = useState(initialStarred);

  // Auto-mark read on mount — skip if already read to avoid unnecessary PATCH
  useEffect(() => {
    if (initialRead) return;
    fetch(`/api/message-states/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: true }),
    }).catch(() => {/* best-effort */});
  }, [messageId, initialRead]);

  const toggleStar = useCallback(async () => {
    const next = !starred;
    setStarred(next);
    try {
      await fetch(`/api/message-states/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_starred: next }),
      });
    } catch {
      setStarred(!next); // revert
    }
  }, [messageId, starred]);

  // Keyboard shortcuts on detail page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, replyHref, backHref, toggleStar]);

  return (
    <button
      onClick={toggleStar}
      title={starred ? 'Unstar (s)' : 'Star (s)'}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-card text-sm font-sans transition-colors hover:bg-rule"
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
  );
}
