'use client';
/**
 * MessageContextMenu — right-click menu for a single message row.
 *
 * Positions next to the cursor, auto-flips when near the viewport edge.
 * Closes on click-outside, Escape, or any of its own actions.
 *
 * Designed to be controlled: parent owns whether the menu is open and
 * for which message id; this component is a pure positioning + action shell.
 */

import { useEffect, useRef } from 'react';
import { Reply, Forward, Star, Mail, Archive, Tag, Trash2, Sparkles, ExternalLink } from 'lucide-react';

export interface ContextMenuActions {
  onOpenInPane: () => void;
  onOpenFullPage: () => void;
  onReply: () => void;
  onForward: () => void;
  onToggleStar: () => void;
  onToggleRead: () => void;
  onAddTag: () => void;
  onAutoTag: () => void;
  onDelete?: () => void;
  isStarred: boolean;
  isRead: boolean;
}

export interface ContextMenuPos {
  x: number;
  y: number;
}

export function MessageContextMenu({
  pos,
  actions,
  onClose,
}: {
  pos: ContextMenuPos;
  actions: ContextMenuActions;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click-outside / Escape
  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const MENU_W = 200;
  const MENU_H = 320;
  const adjX = typeof window !== 'undefined' && pos.x + MENU_W > window.innerWidth ? window.innerWidth - MENU_W - 8 : pos.x;
  const adjY = typeof window !== 'undefined' && pos.y + MENU_H > window.innerHeight ? window.innerHeight - MENU_H - 8 : pos.y;

  function fire(fn: () => void) {
    fn();
    onClose();
  }

  const items: Array<{ icon: typeof Reply; label: string; onClick: () => void; danger?: boolean } | 'divider'> = [
    { icon: Mail, label: 'Open in reading pane', onClick: () => fire(actions.onOpenInPane) },
    { icon: ExternalLink, label: 'Open full page', onClick: () => fire(actions.onOpenFullPage) },
    'divider',
    { icon: Reply, label: 'Reply', onClick: () => fire(actions.onReply) },
    { icon: Forward, label: 'Forward', onClick: () => fire(actions.onForward) },
    'divider',
    { icon: Star, label: actions.isStarred ? 'Unstar' : 'Star', onClick: () => fire(actions.onToggleStar) },
    { icon: Archive, label: actions.isRead ? 'Mark as unread' : 'Mark as read', onClick: () => fire(actions.onToggleRead) },
    'divider',
    { icon: Tag, label: 'Add tag…', onClick: () => fire(actions.onAddTag) },
    { icon: Sparkles, label: 'AI auto-tag', onClick: () => fire(actions.onAutoTag) },
  ];
  if (actions.onDelete) {
    const onDelete = actions.onDelete;
    items.push('divider');
    items.push({ icon: Trash2, label: 'Delete', onClick: () => fire(onDelete), danger: true });
  }

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 w-[200px] bg-cream border border-rule rounded-card shadow-xl py-1 text-xs font-sans"
      style={{ left: adjX, top: adjY }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, idx) => {
        if (item === 'divider') return <div key={`d${idx}`} className="border-t border-rule my-1" />;
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            onClick={item.onClick}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
              item.danger ? 'text-err hover:bg-err/10' : 'text-ink hover:bg-[#f0ede4]'
            }`}
          >
            <Icon size={12} strokeWidth={1.75} className="flex-shrink-0" />
            <span className="flex-1">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
