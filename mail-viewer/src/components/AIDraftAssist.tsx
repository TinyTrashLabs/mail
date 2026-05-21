'use client';
import { useState } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';

interface AIDraftAssistProps {
  to: string;
  subject: string;
  onDraft: (text: string) => void;
}

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'concise', label: 'Concise' },
];

export function AIDraftAssist({ to, subject, onDraft }: AIDraftAssistProps) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState('');
  const [tone, setTone] = useState('professional');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);

  async function generate() {
    setLoading(true);
    setError('');
    setApplied(false);
    try {
      const resp = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, context, tone }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        setError(d.error || 'draft failed');
        return;
      }
      const d = await resp.json();
      onDraft(d.draft);
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-teal/40 rounded-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-teal/8 hover:bg-teal/15 transition-colors text-left"
      >
        <Sparkles size={13} strokeWidth={2} className="text-teal flex-shrink-0" />
        <span className="text-xs font-sans font-medium text-teal-strong flex-1">AI Draft Assist</span>
        <span className="text-xs text-ink-soft font-sans">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 py-3 bg-cream border-t border-teal/20 space-y-3">
          <div>
            <label className="block text-xs font-sans font-medium text-ink-soft mb-1">
              What should this email say? (optional)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={2}
              className="w-full bg-[#f0ede4] border border-rule rounded-card px-3 py-2 text-sm font-sans text-ink focus:outline-none focus:border-teal resize-none placeholder:text-ink-soft/50"
              placeholder="e.g. Decline the meeting, suggest Thursday instead"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-sans text-ink-soft">Tone:</span>
            {TONES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTone(t.value)}
                className={`px-2.5 py-1 rounded-card text-xs font-sans transition-colors ${
                  tone === t.value
                    ? 'bg-teal text-cream'
                    : 'bg-rule text-ink-soft hover:bg-[#d8d4cb]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-xs font-sans text-err">{error}</p>
          )}

          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 bg-teal hover:bg-teal-strong disabled:opacity-50 text-cream rounded-card text-xs font-sans font-medium transition-colors"
          >
            {loading ? (
              <Loader2 size={12} strokeWidth={2} className="animate-spin" />
            ) : applied ? (
              <Check size={12} strokeWidth={2} />
            ) : (
              <Sparkles size={12} strokeWidth={2} />
            )}
            {loading ? 'Drafting…' : applied ? 'Applied!' : 'Generate draft'}
          </button>
        </div>
      )}
    </div>
  );
}
