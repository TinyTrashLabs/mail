'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Sparkles, Search, Loader2, X } from 'lucide-react';

interface MailMessage {
  id: number;
  from_addr: string;
  subject: string;
  received_at: string;
  mailbox: string;
}

interface AISearchBarProps {
  mailbox: string;
}

export function AISearchBar({ mailbox }: AISearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MailMessage[] | null>(null);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResults(null);
    setExplanation('');
    try {
      const resp = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), mailbox }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        setError(d.error || 'search failed');
        return;
      }
      const d = await resp.json();
      setResults(d.results);
      setExplanation(d.explanation);
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setQuery('');
    setResults(null);
    setExplanation('');
    setError('');
  }

  return (
    <div className="w-full">
      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f0ede4] border border-rule rounded-card focus-within:border-teal transition-colors">
        <Sparkles size={13} strokeWidth={2} className="text-teal flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          className="flex-1 bg-transparent text-sm font-sans text-ink focus:outline-none placeholder:text-ink-soft/60 min-w-0"
          placeholder="Search with AI: 'emails from Alice about invoices'…"
        />
        {query && (
          <button onClick={clear} className="text-ink-soft hover:text-ink transition-colors">
            <X size={13} strokeWidth={2} />
          </button>
        )}
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="flex-shrink-0 p-1 text-ink-soft hover:text-teal disabled:opacity-40 transition-colors"
        >
          {loading ? (
            <Loader2 size={13} strokeWidth={2} className="animate-spin" />
          ) : (
            <Search size={13} strokeWidth={2} />
          )}
        </button>
      </div>

      {/* Results */}
      {(results !== null || error) && (
        <div className="mt-2 border border-rule rounded-card overflow-hidden">
          {error ? (
            <div className="px-4 py-3 text-xs font-sans text-err">{error}</div>
          ) : results && results.length === 0 ? (
            <div className="px-4 py-3 text-xs font-sans text-ink-soft">No matching messages found.</div>
          ) : (
            <>
              {explanation && (
                <div className="px-4 py-2 bg-teal/8 border-b border-rule flex items-center gap-1.5">
                  <Sparkles size={11} strokeWidth={2} className="text-teal flex-shrink-0" />
                  <span className="text-xs font-sans text-teal-strong">{explanation}</span>
                </div>
              )}
              <div className="divide-y divide-rule">
                {results!.map((msg) => (
                  <Link
                    key={msg.id}
                    href={`/inbox/${msg.id}?mailbox=${mailbox}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f0ede4] transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-teal-strong flex items-center justify-center text-xs font-bold text-cream flex-shrink-0">
                      {(msg.from_addr[0] || '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-ink truncate">{msg.from_addr.split('@')[0]}</span>
                        <span className="text-xs text-ink-soft flex-shrink-0">
                          {new Date(msg.received_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="text-xs text-ink-soft truncate">{msg.subject}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
