'use client';
/**
 * TagManagementClient — list, rename, and delete tags scoped to a mailbox.
 *
 * Backed by /api/tags (GET/PATCH/DELETE). Optimistic UI with revert on error.
 * No drag-reorder yet; ordering is "most used first" returned by the store.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tag, Pencil, Trash2, Check, X, AlertCircle } from 'lucide-react';

interface TagRow {
  tag: string;
  count: number;
}

const TAG_RE = /^[a-z][a-z0-9-]{0,31}$/;

export function TagManagementClient({
  initialTags,
  mailbox,
}: {
  initialTags: TagRow[];
  mailbox: string;
}) {
  const router = useRouter();
  const [tags, setTags] = useState<TagRow[]>(initialTags);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startEdit = useCallback((tag: string) => {
    setEditing(tag);
    setDraftName(tag);
    setError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setDraftName('');
    setError(null);
  }, []);

  const saveRename = useCallback(async () => {
    if (!editing) return;
    const to = draftName.trim().toLowerCase();
    if (!TAG_RE.test(to)) {
      setError('Tags must be lowercase letters/digits/hyphens, starting with a letter, 1-32 chars.');
      return;
    }
    if (to === editing) { cancelEdit(); return; }
    setBusy(true); setError(null);
    // Skip optimistic merge — count math is easy but source-precedence (user
    // wins over ai on conflict) lives in the SQL CASE on the store side, and
    // an optimistic guess would drift from the true row. Just clear the
    // edit state and let router.refresh() resync from the server.
    setEditing(null);

    try {
      const resp = await fetch(`/api/tags?mailbox=${encodeURIComponent(mailbox)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: editing, to }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || 'rename failed');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'rename failed');
    } finally {
      setBusy(false);
    }
  }, [editing, draftName, tags, mailbox, cancelEdit, router]);

  const deleteTag = useCallback(async (tag: string) => {
    if (!confirm(`Delete tag "${tag}" from every message in this mailbox? This cannot be undone.`)) return;
    setBusy(true); setError(null);
    const prev = tags;
    setTags(t => t.filter(r => r.tag !== tag));
    try {
      const resp = await fetch(`/api/tags?mailbox=${encodeURIComponent(mailbox)}&tag=${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error((await resp.json()).error || 'delete failed');
      router.refresh();
    } catch (err) {
      setTags(prev);
      setError(err instanceof Error ? err.message : 'delete failed');
    } finally {
      setBusy(false);
    }
  }, [tags, mailbox, router]);

  const filtered = tags.filter(t => t.tag.includes(filter.toLowerCase()));

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-2xl mx-auto">
        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 bg-err/10 border border-err rounded-card text-xs font-sans text-err">
            <AlertCircle size={14} strokeWidth={1.75} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="mb-4">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter tags…"
            className="w-full px-3 py-2 text-sm font-sans bg-[#f0ede4] border border-rule rounded-card focus:outline-none focus:border-teal"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-ink-soft text-sm font-sans">
            {tags.length === 0
              ? 'No tags yet. Open a message and use "AI auto-tag" to start.'
              : 'No tags match that filter.'}
          </div>
        ) : (
          <ul className="border border-rule rounded-card divide-y divide-rule bg-cream">
            {filtered.map(({ tag, count }) => (
              <li key={tag} className="flex items-center gap-3 px-4 py-2.5">
                <Tag size={13} strokeWidth={1.75} className="text-ink-soft flex-shrink-0" />
                {editing === tag ? (
                  <>
                    <input
                      autoFocus
                      value={draftName}
                      onChange={e => setDraftName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRename();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="flex-1 px-2 py-1 text-sm font-sans bg-[#f0ede4] border border-rule rounded focus:outline-none focus:border-teal"
                    />
                    <button onClick={saveRename} disabled={busy}
                      className="p-1.5 rounded text-teal-strong hover:bg-teal/10 disabled:opacity-50" title="Save (Enter)">
                      <Check size={14} strokeWidth={2} />
                    </button>
                    <button onClick={cancelEdit} disabled={busy}
                      className="p-1.5 rounded text-ink-soft hover:bg-rule disabled:opacity-50" title="Cancel (Esc)">
                      <X size={14} strokeWidth={2} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-sans text-ink font-medium">{tag}</span>
                    <span className="text-xs text-ink-soft font-sans">{count}</span>
                    <button onClick={() => startEdit(tag)} disabled={busy}
                      className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-rule disabled:opacity-50" title="Rename">
                      <Pencil size={13} strokeWidth={1.75} />
                    </button>
                    <button onClick={() => deleteTag(tag)} disabled={busy}
                      className="p-1.5 rounded text-ink-soft hover:text-err hover:bg-err/10 disabled:opacity-50" title="Delete">
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-xs font-sans text-ink-soft">
          Tip: rename merges. If a tag named "to" already exists, the rename combines counts onto it.
        </p>
      </div>
    </div>
  );
}
