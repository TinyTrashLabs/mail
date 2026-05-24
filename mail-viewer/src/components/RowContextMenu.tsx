'use client';

/**
 * RowContextMenu — popover menu used both as the inbox row's `…` overflow
 * menu and the right-click context menu. Same actions either way: toggle
 * read/unread, toggle star, trash/restore, open in new tab.
 *
 * Positioning is anchored at (x, y) viewport coords. The parent decides
 * where to place it — for the `…` button, the button's getBoundingClientRect
 * gives the anchor; for right-click, the MouseEvent.client{X,Y} does.
 *
 * Closes on: outside click, Escape, scroll, window resize, route change
 * (handled by parent unmounting).
 */

import { useEffect, useRef } from 'react';
import { Star, Trash2, MailOpen, Mail, RotateCcw, ExternalLink } from 'lucide-react';

export interface RowContextMenuProps {
  x: number;
  y: number;
  isRead: boolean;
  isStarred: boolean;
  isTrashed: boolean;
  onClose: () => void;
  onToggleRead: () => void;
  onToggleStar: () => void;
  onToggleTrash: () => void;
  onOpenNewTab: () => void;
}

export function RowContextMenu({
  x,
  y,
  isRead,
  isStarred,
  isTrashed,
  onClose,
  onToggleRead,
  onToggleStar,
  onToggleTrash,
  onOpenNewTab,
}: RowContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape / scroll / resize
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScrollOrResize = () => onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [onClose]);

  // Clamp menu inside the viewport — for clicks near the right or bottom edge
  // we shift up/left so the menu doesn't clip off-screen. Heights are tuned
  // to the actual rendered content (4 items + divider ≈ 150px).
  const MENU_W = 200;
  const MENU_H = 150;
  const left = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : x + MENU_W) - MENU_W - 8);
  const top = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : y + MENU_H) - MENU_H - 8);

  const item =
    'flex items-center gap-2 w-full px-3 py-1.5 text-xs font-sans text-ink hover:bg-rule cursor-pointer text-left';

  // Wrap an action handler so it auto-closes after invoking.
  const wrap = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', left, top, zIndex: 60 }}
      className="bg-cream border border-rule rounded-card shadow-lg py-1 min-w-[180px] select-none"
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      <button className={item} onClick={wrap(onToggleRead)} role="menuitem">
        {isRead ? (
          <>
            <Mail size={13} strokeWidth={1.75} className="text-ink-soft" />
            <span>Mark as unread</span>
          </>
        ) : (
          <>
            <MailOpen size={13} strokeWidth={1.75} className="text-ink-soft" />
            <span>Mark as read</span>
          </>
        )}
      </button>
      <button className={item} onClick={wrap(onToggleStar)} role="menuitem">
        <Star
          size={13}
          strokeWidth={1.75}
          className={isStarred ? 'fill-[#d8a14a] text-[#d8a14a]' : 'text-ink-soft'}
        />
        <span>{isStarred ? 'Unstar' : 'Star'}</span>
      </button>
      <button className={item} onClick={wrap(onToggleTrash)} role="menuitem">
        {isTrashed ? (
          <>
            <RotateCcw size={13} strokeWidth={1.75} className="text-ink-soft" />
            <span>Restore from trash</span>
          </>
        ) : (
          <>
            <Trash2 size={13} strokeWidth={1.75} className="text-ink-soft" />
            <span>Move to trash</span>
          </>
        )}
      </button>
      <div className="border-t border-rule my-1" />
      <button className={item} onClick={wrap(onOpenNewTab)} role="menuitem">
        <ExternalLink size={13} strokeWidth={1.75} className="text-ink-soft" />
        <span>Open in new tab</span>
      </button>
    </div>
  );
}
