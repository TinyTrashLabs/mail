'use client';
import { FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { openComposeDrawer } from '@/components/ComposeDrawer';
import type { Draft } from '@/lib/mail-store';

interface DraftsClientProps {
  drafts: Draft[];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function DraftsClient({ drafts: initial }: DraftsClientProps) {
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  async function deleteDraft(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(id);
    try {
      await fetch(`/api/drafts/${id}`, { method: 'DELETE' });
      setDrafts(prev => prev.filter(d => d.id !== id));
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  async function openDraft(draft: Draft) {
    setOpening(draft.id);
    try {
      // Fetch full draft (with text_body/html_body) from server
      const resp = await fetch(`/api/drafts/${draft.id}`);
      const full: Draft = resp.ok ? await resp.json() : draft;
      openComposeDrawer({
        to: full.to_addrs,
        subject: full.subject,
        inReplyTo: full.in_reply_to || undefined,
        draftId: full.id,
        body: full.text_body || '',
        html: full.html_body || undefined,
      });
    } finally {
      setOpening(null);
    }
  }

  if (drafts.length === 0) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <FileText size={40} strokeWidth={1.25} className="text-ink-soft/40 mb-3" />
        <p className="text-sm font-sans text-ink-soft">No saved drafts</p>
        <p className="text-xs font-sans text-ink-soft/60 mt-1">Compose a message and save it here</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-rule bg-cream flex-shrink-0">
        <FileText size={15} strokeWidth={1.75} className="text-ink-soft" />
        <h1 className="text-sm font-sans font-semibold text-ink">Drafts</h1>
        <span className="text-xs font-sans text-ink-soft ml-1">({drafts.length})</span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-rule">
        {drafts.map(draft => (
          <button
            key={draft.id}
            onClick={() => openDraft(draft)}
            disabled={opening === draft.id}
            className="w-full flex items-start gap-3 px-6 py-3 hover:bg-[#f0ede4] transition-colors text-left group disabled:opacity-60"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-sans font-medium text-ink truncate">
                  {draft.subject || '(no subject)'}
                </span>
                {draft.to_addrs && (
                  <span className="text-xs font-sans text-ink-soft truncate">
                    → {draft.to_addrs}
                  </span>
                )}
              </div>
              <span className="text-xs font-sans text-ink-soft/60">
                {opening === draft.id ? 'Opening…' : `Saved ${formatDate(draft.updated_at)}`}
              </span>
            </div>
            <button
              onClick={(e) => deleteDraft(draft.id, e)}
              disabled={deleting === draft.id}
              className="flex-shrink-0 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-rule text-ink-soft hover:text-err transition-all"
              title="Delete draft"
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </button>
        ))}
      </div>
    </main>
  );
}
