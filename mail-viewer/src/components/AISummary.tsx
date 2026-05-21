'use client';
import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface AISummaryProps {
  messageId: number;
  subject: string;
  from: string;
  body: string;
}

export function AISummary({ messageId, subject, from, body }: AISummaryProps) {
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (summary) {
      setOpen((v) => !v);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, from, body }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        setError(d.error || 'summarize failed');
        return;
      }
      const d = await resp.json();
      setSummary(d.summary);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-5 border border-teal/40 rounded-card overflow-hidden">
      <button
        onClick={load}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-teal/8 hover:bg-teal/15 transition-colors text-left"
      >
        {loading ? (
          <Loader2 size={13} strokeWidth={2} className="text-teal animate-spin flex-shrink-0" />
        ) : (
          <Sparkles size={13} strokeWidth={2} className="text-teal flex-shrink-0" />
        )}
        <span className="text-xs font-sans font-medium text-teal-strong flex-1">
          {loading ? 'Summarizing…' : 'AI Summary'}
        </span>
        {!loading && (open ? <ChevronUp size={13} className="text-teal" /> : <ChevronDown size={13} className="text-teal" />)}
      </button>

      {(open || error) && (
        <div className="px-4 py-3 bg-cream border-t border-teal/20">
          {error ? (
            <p className="text-xs font-sans text-err">{error}</p>
          ) : (
            <p className="text-sm font-sans text-ink leading-relaxed">{summary}</p>
          )}
        </div>
      )}
    </div>
  );
}
