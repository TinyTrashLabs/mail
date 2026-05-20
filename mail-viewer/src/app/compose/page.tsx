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
      <aside className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col p-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          TTL Mail
        </div>
        <button onClick={() => router.back()} className="text-sm text-gray-300 hover:text-white text-left">
          ← Cancel
        </button>
      </aside>

      <main className="flex-1 p-8 max-w-2xl">
        <h1 className="text-lg font-semibold mb-6">New Message</h1>
        {error && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded text-sm text-red-300">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">To</label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="recipient@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none font-mono"
            />
          </div>
          <button
            onClick={send}
            disabled={sending || !to || !subject || !body}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm font-medium"
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
