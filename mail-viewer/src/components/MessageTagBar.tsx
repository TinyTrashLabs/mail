'use client';

/**
 * MessageTagBar — inline tag display + add/remove + AI auto-tag for the
 * message detail page. Posts to /api/messages/:id/tags and /api/ai/auto-tag.
 *
 * The AI button calls auto-tag with the message's subject/from/body, then
 * adds the returned tags via the same POST /tags route with source='ai'.
 *
 * All setTags calls use the functional form so concurrent removes / adds /
 * AI completions interleave correctly without dropping each other's edits.
 */

import { useCallback, useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import { AddTagDialog } from './AddTagDialog';

interface MessageTagBarProps {
  messageId: number;
  subject: string;
  from: string;
  body: string;
  initialTags: string[];
}

type Notice = { kind: 'error' | 'info'; text: string } | null;

export function MessageTagBar({
  messageId,
  subject,
  from,
  body,
  initialTags,
}: MessageTagBarProps) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [adding, setAdding] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const removeTag = useCallback(async (tag: string) => {
    // Functional update keeps in-flight adds/AI from being clobbered
    setTags(prev => prev.filter(t => t !== tag));
    try {
      const resp = await fetch(`/api/messages/${messageId}/tags?tag=${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      });
      if (!resp.ok) {
        // Revert just this tag if removal failed, without dropping concurrent edits
        setTags(prev => (prev.includes(tag) ? prev : [...prev, tag].sort()));
        setNotice({ kind: 'error', text: 'Failed to remove tag.' });
      }
    } catch {
      setTags(prev => (prev.includes(tag) ? prev : [...prev, tag].sort()));
      setNotice({ kind: 'error', text: 'Failed to remove tag.' });
    }
  }, [messageId]);

  const onAdded = useCallback((newTags: string[]) => {
    setTags(prev => Array.from(new Set([...prev, ...newTags])).sort());
    setAdding(false);
    setNotice(null);
  }, []);

  const runAutoTag = useCallback(async () => {
    setAiLoading(true);
    setNotice(null);
    // Snapshot tags at request time for the existing-tags hint to the model.
    // The merge below uses functional setTags so any concurrent edits survive.
    const existingSnapshot = tags;
    try {
      const resp = await fetch('/api/ai/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          from,
          body,
          existingTags: existingSnapshot,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setNotice({ kind: 'error', text: json.error || 'AI tagging failed.' });
        return;
      }
      const suggested: string[] = Array.isArray(json.tags) ? json.tags : [];
      // Filter against the CURRENT tag set (not the snapshot) — user may have
      // added/removed while AI was thinking.
      let toPersist: string[] = [];
      setTags(prev => {
        toPersist = suggested.filter(t => !prev.includes(t));
        return prev; // no state change yet; persist first
      });
      if (!toPersist.length) {
        setNotice({ kind: 'info', text: 'AI didn\'t suggest any new tags.' });
        return;
      }
      // Persist via the same /tags route with source='ai'
      const saveResp = await fetch(`/api/messages/${messageId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: toPersist, source: 'ai' }),
      });
      const saveJson = await saveResp.json().catch(() => ({}));
      if (!saveResp.ok) {
        setNotice({ kind: 'error', text: saveJson.error || 'Failed to save AI tags.' });
        return;
      }
      setTags(prev => Array.from(new Set([...prev, ...toPersist])).sort());
      setNotice(null);
    } catch {
      setNotice({ kind: 'error', text: 'AI request failed.' });
    } finally {
      setAiLoading(false);
    }
  }, [messageId, subject, from, body, tags]);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-teal/10 text-teal text-xs font-sans rounded-full"
          >
            <span>{tag}</span>
            <button
              onClick={() => removeTag(tag)}
              className="rounded-full hover:bg-teal/20 p-0.5 transition-colors"
              title="Remove tag"
              aria-label={`Remove tag ${tag}`}
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-sans text-ink-soft hover:text-ink hover:bg-rule rounded-full transition-colors min-h-[28px]"
          title="Add tag"
        >
          <Plus size={12} strokeWidth={2} />
          Tag
        </button>
        <button
          onClick={runAutoTag}
          disabled={aiLoading}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-sans text-teal hover:bg-teal/10 rounded-full transition-colors min-h-[28px] disabled:opacity-60 disabled:cursor-not-allowed"
          title="Suggest tags with AI"
        >
          <Sparkles size={12} strokeWidth={2} />
          {aiLoading ? 'Thinking…' : 'AI tag'}
        </button>
      </div>
      {notice && (
        <div className={`mt-1.5 text-xs font-sans ${notice.kind === 'error' ? 'text-[#c94b4b]' : 'text-ink-soft'}`}>
          {notice.text}
        </div>
      )}
      {adding && (
        <AddTagDialog
          messageId={messageId}
          existingTags={tags}
          onAdded={onAdded}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
