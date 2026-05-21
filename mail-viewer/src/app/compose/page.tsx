'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function ComposeForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [to, setTo] = useState(sp.get('replyTo') || '');
  const [subject, setSubject] = useState(sp.get('subject') || '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const inReplyTo = sp.get('inReplyTo') || '';

  async function send() {
    setSending(true);
    setError('');
    try {
      const resp = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body, inReplyTo: inReplyTo || undefined }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        setError(d.error || 'send failed');
        return;
      }
      router.push('/inbox');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-screen">
      <aside className="w-48 bg-[#f0ede4] border-r border-rule flex flex-col p-4">
        <div className="text-xs font-sans font-semibold text-ink-soft uppercase tracking-wider mb-3">
          TTL Mail
        </div>
        <button onClick={() => router.back()} className="text-sm font-sans text-ink-soft hover:text-ink text-left">
          ← Cancel
        </button>
      </aside>

      <main className="flex-1 p-8 max-w-2xl">
        <h1 className="text-lg font-semibold mb-6">New Message</h1>
        {error && (
          <div className="mb-4 p-3 bg-err/10 border border-err rounded-card text-sm font-sans text-err">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-sans font-medium text-ink-soft mb-1">To</label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-[#f0ede4] border border-rule rounded-card px-3 py-2 text-sm font-sans text-ink focus:outline-none focus:border-teal"
              placeholder="recipient@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-sans font-medium text-ink-soft mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-[#f0ede4] border border-rule rounded-card px-3 py-2 text-sm font-sans text-ink focus:outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-sans font-medium text-ink-soft mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="w-full bg-[#f0ede4] border border-rule rounded-card px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:border-teal resize-none"
            />
          </div>
          <button
            onClick={send}
            disabled={sending || !to || !subject || !body}
            className="px-6 py-2 bg-teal hover:bg-teal-strong disabled:opacity-50 text-cream rounded-card text-sm font-sans font-medium transition-colors"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense>
      <ComposeForm />
    </Suspense>
  );
}
