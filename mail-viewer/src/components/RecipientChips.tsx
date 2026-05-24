'use client';
import { useRef, useState, KeyboardEvent, ClipboardEvent, FocusEvent } from 'react';
import { X } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RecipientChipsProps {
  /** Controlled value: comma-joined emails (matches the wire format the
   * compose form already serializes to FormData/JSON). */
  value: string;
  onChange: (next: string) => void;
  /** id used by the matching <label htmlFor=...> */
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}

/**
 * Inputting an email and pressing Enter, Tab, or "," commits it as a chip.
 * Backspace on an empty input pops the last chip back into edit mode so a
 * typo on the most recent one is one keystroke away from a fix.
 * Paste of a comma/whitespace-separated list bulk-creates chips.
 */
export function RecipientChips({
  value,
  onChange,
  id,
  placeholder,
  ariaLabel,
  autoFocus,
}: RecipientChipsProps) {
  const chips = value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function emit(next: string[]) {
    onChange(next.join(', '));
  }

  function commitDraft(raw: string): boolean {
    const v = raw.trim().replace(/,$/, '').trim();
    if (!v) return false;
    if (chips.includes(v)) {
      setDraft('');
      return true; // dedupe silently
    }
    emit([...chips, v]);
    setDraft('');
    return true;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      if (draft.trim()) {
        e.preventDefault();
        commitDraft(draft);
      }
      return;
    }
    if (e.key === 'Backspace' && !draft && chips.length) {
      e.preventDefault();
      const popped = chips[chips.length - 1];
      emit(chips.slice(0, -1));
      setDraft(popped); // re-edit it
    }
  }

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    void e;
    if (draft.trim()) commitDraft(draft);
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (!/[,;\s]/.test(text)) return; // single token; let default handling fill the input
    e.preventDefault();
    const tokens = text.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    const next = [...chips];
    for (const t of tokens) {
      if (!next.includes(t)) next.push(t);
    }
    emit(next);
    setDraft('');
  }

  function removeChip(idx: number) {
    emit(chips.filter((_, i) => i !== idx));
    inputRef.current?.focus();
  }

  return (
    <div
      className="flex-1 flex flex-wrap items-center gap-1 px-2 py-2 min-h-[40px]"
      onClick={() => inputRef.current?.focus()}
    >
      {chips.map((chip, i) => {
        const valid = EMAIL_RE.test(chip);
        return (
          <span
            key={`${chip}-${i}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-sans border ${
              valid
                ? 'bg-teal/10 border-teal/30 text-ink'
                : 'bg-err/10 border-err/40 text-err'
            }`}
            title={valid ? chip : `${chip} — not a valid email`}
          >
            {chip}
            <button
              type="button"
              onClick={(ev) => { ev.stopPropagation(); removeChip(i); }}
              aria-label={`Remove ${chip}`}
              className="hover:text-err transition-colors"
            >
              <X size={11} strokeWidth={2} />
            </button>
          </span>
        );
      })}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onPaste={handlePaste}
        type="text"
        aria-label={ariaLabel}
        placeholder={chips.length === 0 ? placeholder : ''}
        autoFocus={autoFocus}
        className="flex-1 min-w-[140px] bg-transparent text-sm font-sans text-ink focus:outline-none placeholder:text-ink-soft/50"
      />
    </div>
  );
}
