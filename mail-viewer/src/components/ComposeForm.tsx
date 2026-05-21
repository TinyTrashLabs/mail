'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Send, X } from 'lucide-react';

interface ComposeFormProps {
  defaultTo?: string;
  defaultSubject?: string;
  defaultInReplyTo?: string;
}

export function ComposeForm({ defaultTo = '', defaultSubject = '', defaultInReplyTo = '' }: ComposeFormProps) {
  const router = useRouter();
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setSending(true);
    setError('');
    try {
      const resp = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          body,
          inReplyTo: defaultInReplyTo || undefined,
        }),
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
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-rule bg-cream flex-shrink-0">
        <h1 className="text-sm font-sans font-semibold text-ink">New Message</h1>
        <div className="flex-1" />
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-card text-ink-soft hover:bg-rule hover:text-ink transition-colors"
          title="Discard"
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>

      {/* Compose area */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          {error && (
            <div className="mb-4 p-3 bg-err/10 border border-err rounded-card text-sm font-sans text-err">
              {error}
            </div>
          )}

          <div className="border border-rule rounded-card overflow-hidden">
            {/* To */}
            <div className="flex items-center border-b border-rule">
              <label className="px-4 py-3 text-xs font-sans font-medium text-ink-soft w-16 flex-shrink-0">
                To
              </label>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="flex-1 bg-transparent px-3 py-3 text-sm font-sans text-ink focus:outline-none placeholder:text-ink-soft/50"
                placeholder="recipient@example.com"
                autoFocus={!to}
              />
            </div>

            {/* Subject */}
            <div className="flex items-center border-b border-rule">
              <label className="px-4 py-3 text-xs font-sans font-medium text-ink-soft w-16 flex-shrink-0">
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 bg-transparent px-3 py-3 text-sm font-sans text-ink focus:outline-none placeholder:text-ink-soft/50"
                placeholder="Subject"
              />
            </div>

            {/* Body */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={18}
              className="w-full bg-transparent px-4 py-4 text-sm font-mono text-ink focus:outline-none resize-none placeholder:text-ink-soft/50"
              placeholder="Write your message…"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={send}
              disabled={sending || !to || !subject || !body}
              className="flex items-center gap-2 px-5 py-2 bg-teal hover:bg-teal-strong disabled:opacity-50 text-cream rounded-card text-sm font-sans font-medium transition-colors"
            >
              <Send size={13} strokeWidth={2} />
              {sending ? 'Sending…' : 'Send'}
            </button>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 text-sm font-sans text-ink-soft hover:text-ink transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
