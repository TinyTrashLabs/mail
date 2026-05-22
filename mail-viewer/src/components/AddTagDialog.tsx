'use client';
/**
 * AddTagDialog — small modal for adding a tag to a single message.
 * Validates against the same regex the auto-tag API enforces.
 */
import { useEffect, useRef, useState } from 'react';
import { Tag, X } from 'lucide-react';

const TAG_RE = /^[a-z][a-z0-9-]{0,31}$/;

export function AddTagDialog({
  messageId,
  existingTags,
  onClose,
  onAdded,
}: {
  messageId: number;
  existingTags: string[];
  onClose: () => void;
  onAdded: (tags: string[]) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    const candidates = value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!candidates.length) { setError('Enter at least one tag.'); return; }
    const bad = candidates.find(t => !TAG_RE.test(t));
    if (bad) { setError(`"${bad}" is invalid (lowercase, letters/digits/hyphens, 1-32 chars, must start with a letter).`); return; }
    const fresh = candidates.filter(t => !existingTags.includes(t));
    if (!fresh.length) { setError('All those tags already exist on this message.'); return; }
    setBusy(true);
    try {
      const resp = await fetch(`/api/messages/${messageId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: fresh, source: 'user' }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) { setError(json.error || 'Failed to add tags.'); return; }
      onAdded(fresh);
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-cream rounded-card shadow-xl p-5 max-w-sm w-full mx-4 border border-rule" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Tag size={14} strokeWidth={1.75} className="text-ink-soft" />
            <h2 className="font-serif font-semibold text-ink text-sm">Add tag</h2>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink"><X size={14} strokeWidth={2} /></button>
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="e.g. important, follow-up, receipt"
          className="w-full px-3 py-2 text-sm font-sans bg-[#f0ede4] border border-rule rounded-card focus:outline-none focus:border-teal mb-2"
        />
        <p className="text-[11px] font-sans text-ink-soft mb-3">
          Separate multiple with commas. Lowercase letters/digits/hyphens, 1-32 chars.
        </p>
        {error && (
          <p className="text-[11px] font-sans text-err mb-3">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="px-3 py-1.5 text-xs font-sans text-ink-soft hover:text-ink">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="px-3 py-1.5 bg-teal hover:bg-teal-strong disabled:opacity-50 text-cream rounded-card text-xs font-sans font-medium">
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
