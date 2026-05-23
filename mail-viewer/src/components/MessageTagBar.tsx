'use client';

/**
 * MessageTagBar — inline tag display + add/remove + AI auto-tag for the
 * message detail page. Posts to /api/messages/:id/tags and /api/ai/auto-tag.
 *
 * The AI button calls auto-tag with the message's subject/from/body, then
 * adds the returned tags via the same POST /tags route with source='ai'.
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
  const [error, setError] = useState<string | null>(null);

  const removeTag = useCallback(async (tag: string) => {
    const prev = tags;
    setTags(tags.filter(t => t !== tag));
    try {
      const resp = await fetch(`/api/messages/${messageId}/tags?tag=${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      });
      if (!resp.ok) {
        setTags(prev);
        setError('Failed to remove tag.');
      }
    } catch {
      setTags(prev);
      setError('Failed to remove tag.');
    }
  }, [messageId, tags]);

  const onAdded = useCallback((newTags: string[]) => {
    const merged = Array.from(new Set([...tags, ...newTags])).sort();
    setTags(merged);
    setAdding(false);
    setError(null);
  }, [tags]);

  const runAutoTag = useCallback(async () => {
    setAiLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/ai/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          from,
          body,
          existingTags: tags,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(json.error || 'AI tagging failed.');
        return;
      }
      const suggested: string[] = Array.isArray(json.tags) ? json.tags : [];
      // Filter out tags the message already has
      const fresh = suggested.filter(t => !tags.includes(t));
      if (!fresh.length) {
        setError('AI didn\'t suggest any new tags.');
        return;
      }
      // Persist via the same /tags route with source='ai'
      const saveResp = await fetch(`/api/messages/${messageId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: fresh, source: 'ai' }),
      });
      const saveJson = await saveResp.json().catch(() => ({}));
      if (!saveResp.ok) {
        setError(saveJson.error || 'Failed to save AI tags.');
        return;
      }
      const merged = Array.from(new Set([...tags, ...fresh])).sort();
      setTags(merged);
    } catch {
      setError('AI request failed.');
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
      {error && (
        <div className="mt-1.5 text-xs text-[#c94b4b] font-sans">{error}</div>
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
