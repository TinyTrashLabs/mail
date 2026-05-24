'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Send, X, Paperclip, Bold, Italic, Link2, List, ChevronDown, Save } from 'lucide-react';
import { AIDraftAssist } from '@/components/AIDraftAssist';
import { RecipientChips } from '@/components/RecipientChips';

interface ComposeFormProps {
  defaultTo?: string;
  defaultSubject?: string;
  defaultInReplyTo?: string;
  draftId?: number;
  popup?: boolean;
}

type EditorMode = 'plain' | 'rich';

function RichToolbar({ onFormat }: { onFormat: (cmd: string, val?: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-rule bg-[#f0ede4]">
      <button type="button" onMouseDown={e => { e.preventDefault(); onFormat('bold'); }}
        className="p-1 rounded hover:bg-rule text-ink-soft hover:text-ink transition-colors" title="Bold">
        <Bold size={13} strokeWidth={2} />
      </button>
      <button type="button" onMouseDown={e => { e.preventDefault(); onFormat('italic'); }}
        className="p-1 rounded hover:bg-rule text-ink-soft hover:text-ink transition-colors" title="Italic">
        <Italic size={13} strokeWidth={2} />
      </button>
      <button type="button" onMouseDown={e => {
        e.preventDefault();
        const url = prompt('URL:');
        if (url) onFormat('createLink', url);
      }} className="p-1 rounded hover:bg-rule text-ink-soft hover:text-ink transition-colors" title="Link">
        <Link2 size={13} strokeWidth={2} />
      </button>
      <button type="button" onMouseDown={e => { e.preventDefault(); onFormat('insertUnorderedList'); }}
        className="p-1 rounded hover:bg-rule text-ink-soft hover:text-ink transition-colors" title="List">
        <List size={13} strokeWidth={2} />
      </button>
      <div className="w-px h-4 bg-rule mx-1" />
      <select onMouseDown={e => e.stopPropagation()} onChange={e => { onFormat('fontSize', e.target.value); e.target.value = ''; }}
        className="text-xs font-sans text-ink-soft bg-transparent border-none focus:outline-none cursor-pointer">
        <option value="">Size</option>
        <option value="1">Small</option>
        <option value="3">Normal</option>
        <option value="5">Large</option>
        <option value="7">Huge</option>
      </select>
    </div>
  );
}

export function ComposeForm({ defaultTo = '', defaultSubject = '', defaultInReplyTo = '', draftId: initialDraftId, popup }: ComposeFormProps) {
  const router = useRouter();
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [richBodyText, setRichBodyText] = useState('');
  const [editorMode, setEditorMode] = useState<EditorMode>('rich');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [error, setError] = useState('');
  const [draftId, setDraftId] = useState<number | null>(initialDraftId ?? null);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function execFormat(cmd: string, val?: string) {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  }

  function getBodyContent(): { text: string; html: string | null } {
    if (editorMode === 'rich' && editorRef.current) {
      const html = editorRef.current.innerHTML;
      const text = editorRef.current.innerText || '';
      return { text, html };
    }
    return { text: body, html: null };
  }

  function handleDraft(draft: string) {
    if (editorMode === 'rich' && editorRef.current) {
      editorRef.current.innerHTML = draft.replace(/\n/g, '<br>');
      setRichBodyText(editorRef.current.innerText || draft);
    } else {
      setBody(draft);
    }
  }

  async function saveDraft() {
    const { text, html } = getBodyContent();
    const payload = { to, cc, bcc, subject, text, html: html || null, inReplyTo: defaultInReplyTo || null };
    try {
      if (draftId !== null) {
        await fetch(`/api/drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const resp = await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (resp.ok) {
          const data = await resp.json();
          setDraftId(data.id);
        }
      }
      try { localStorage.removeItem('mail_draft'); } catch {}
      setSavedDraft(true);
      setTimeout(() => setSavedDraft(false), 2000);
    } catch {
      setError('Could not save draft — check your connection and try again.');
    }
  }

  async function send() {
    setSending(true);
    setError('');
    try {
      const { text, html } = getBodyContent();
      const ccList = cc.split(',').map(s => s.trim()).filter(Boolean);
      const bccList = bcc.split(',').map(s => s.trim()).filter(Boolean);

      if (attachments.length > 0) {
        // Send as multipart/form-data with attachments
        const form = new FormData();
        form.append('to', to);
        form.append('subject', subject);
        form.append('body', text);
        if (html) form.append('html', html);
        if (defaultInReplyTo) form.append('inReplyTo', defaultInReplyTo);
        ccList.forEach(a => form.append('cc', a));
        bccList.forEach(a => form.append('bcc', a));
        attachments.forEach(f => form.append('attachments', f));

        const resp = await fetch('/api/send', { method: 'POST', body: form });
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          setError(d.error || 'Send failed');
          return;
        }
      } else {
        const resp = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to, subject, body: text, html: html || undefined,
            cc: ccList.length ? ccList : undefined,
            bcc: bccList.length ? bccList : undefined,
            inReplyTo: defaultInReplyTo || undefined,
          }),
        });
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          setError(d.error || 'Send failed');
          return;
        }
      }
      // Clear draft on success
      try { localStorage.removeItem('mail_draft'); } catch {}
      if (draftId !== null) {
        fetch(`/api/drafts/${draftId}`, { method: 'DELETE' }).catch(() => {});
      }
      if (popup) {
        window.close();
      } else {
        router.push('/inbox');
      }
    } finally {
      setSending(false);
    }
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  }

  const bodyEmpty = editorMode === 'rich' ? !richBodyText.trim() : !body.trim();

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-rule bg-cream flex-shrink-0">
        <h1 className="text-sm font-sans font-semibold text-ink">New Message</h1>
        <div className="flex-1" />
        <button onClick={saveDraft} className="flex items-center gap-1.5 text-xs font-sans text-ink-soft hover:text-ink transition-colors" title="Save draft">
          <Save size={13} strokeWidth={1.75} />
          {savedDraft ? 'Saved!' : 'Draft'}
        </button>
        <button onClick={() => router.back()} className="p-1.5 rounded-card text-ink-soft hover:bg-rule hover:text-ink transition-colors" title="Discard">
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>

      {/* Compose area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {error && (
            <div className="p-3 bg-err/10 border border-err rounded-card text-sm font-sans text-err">{error}</div>
          )}

          {/* Compose card */}
          <div className="border border-rule rounded-card overflow-hidden">
            {/* To */}
            <div className="flex items-start border-b border-rule">
              <label htmlFor="compose-to" className="px-4 py-3 text-xs font-sans font-medium text-ink-soft w-14 flex-shrink-0">To</label>
              <RecipientChips
                id="compose-to"
                value={to}
                onChange={setTo}
                placeholder="recipient@example.com"
                ariaLabel="Recipient email addresses"
                autoFocus={!to}
              />
              <button onClick={() => setShowCcBcc(v => !v)}
                aria-label={showCcBcc ? 'Hide CC and BCC fields' : 'Show CC and BCC fields'}
                aria-expanded={showCcBcc}
                className="flex items-center gap-0.5 px-3 py-3 text-xs font-sans text-ink-soft hover:text-ink transition-colors flex-shrink-0">
                CC/BCC <ChevronDown size={11} strokeWidth={2} className={`transition-transform ${showCcBcc ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* CC / BCC */}
            {showCcBcc && (
              <>
                <div className="flex items-start border-b border-rule">
                  <label htmlFor="compose-cc" className="px-4 py-2.5 text-xs font-sans font-medium text-ink-soft w-14 flex-shrink-0">CC</label>
                  <RecipientChips
                    id="compose-cc"
                    value={cc}
                    onChange={setCc}
                    placeholder="cc@example.com"
                    ariaLabel="CC email addresses"
                  />
                </div>
                <div className="flex items-start border-b border-rule">
                  <label htmlFor="compose-bcc" className="px-4 py-2.5 text-xs font-sans font-medium text-ink-soft w-14 flex-shrink-0">BCC</label>
                  <RecipientChips
                    id="compose-bcc"
                    value={bcc}
                    onChange={setBcc}
                    placeholder="bcc@example.com"
                    ariaLabel="BCC email addresses"
                  />
                </div>
              </>
            )}

            {/* Subject */}
            <div className="flex items-center border-b border-rule">
              <label htmlFor="compose-subject" className="px-4 py-3 text-xs font-sans font-medium text-ink-soft w-14 flex-shrink-0">Subject</label>
              <input id="compose-subject" value={subject} onChange={e => setSubject(e.target.value)}
                className="flex-1 bg-transparent px-3 py-3 text-sm font-sans text-ink focus:outline-none placeholder:text-ink-soft/50"
                placeholder="Subject" />
            </div>

            {/* Editor mode toggle */}
            <div className="flex items-center gap-2 px-4 py-1.5 border-b border-rule bg-[#f0ede4]/50">
              <span className="text-xs font-sans text-ink-soft">Format:</span>
              {(['rich', 'plain'] as EditorMode[]).map(mode => (
                <button key={mode} type="button" onClick={() => setEditorMode(mode)}
                  className={`text-xs px-2 py-0.5 rounded font-sans transition-colors capitalize ${editorMode === mode ? 'bg-teal text-cream' : 'text-ink-soft hover:text-ink'}`}>
                  {mode === 'rich' ? 'HTML' : 'Plain text'}
                </button>
              ))}
            </div>

            {/* Rich editor toolbar */}
            {editorMode === 'rich' && <RichToolbar onFormat={execFormat} />}

            {/* Body */}
            {editorMode === 'rich' ? (
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => setRichBodyText(editorRef.current?.innerText || '')}
                className="min-h-[200px] px-4 py-4 text-sm font-sans text-ink focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-ink-soft/50"
                data-placeholder="Write your message…"
                style={{ whiteSpace: 'pre-wrap' }}
              />
            ) : (
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={12}
                className="w-full bg-transparent px-4 py-4 text-sm font-mono text-ink focus:outline-none resize-none placeholder:text-ink-soft/50"
                placeholder="Write your message…" />
            )}

            {/* Attachments list */}
            {attachments.length > 0 && (
              <div className="border-t border-rule px-4 py-2 space-y-1">
                {attachments.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-sans text-ink">
                    <Paperclip size={11} strokeWidth={1.75} className="text-ink-soft" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-ink-soft">({(f.size / 1024).toFixed(1)}KB)</span>
                    <button onClick={() => removeAttachment(i)} className="text-ink-soft hover:text-err transition-colors">
                      <X size={11} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI draft assist */}
          <AIDraftAssist to={to} subject={subject} onDraft={handleDraft} />

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button onClick={send} disabled={sending || !to || !subject || bodyEmpty}
              title={!to ? 'Add a recipient to send' : !subject ? 'Add a subject to send' : bodyEmpty ? 'Write a message body to send' : 'Send message'}
              className="flex items-center gap-2 px-5 py-2 min-h-[40px] bg-teal hover:bg-teal-strong disabled:opacity-50 disabled:cursor-not-allowed text-cream rounded-card text-sm font-sans font-medium transition-colors">
              <Send size={13} strokeWidth={2} />
              {sending ? 'Sending…' : 'Send'}
            </button>
            {(!to || !subject || bodyEmpty) && !sending && (
              <span className="text-xs font-sans text-ink-soft/70">
                {!to ? '— add a recipient first' : !subject ? '— add a subject first' : '— write a message body first'}
              </span>
            )}
            {/* Attach file */}
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 border border-rule rounded-card text-sm font-sans text-ink-soft hover:text-ink hover:bg-rule transition-colors">
              <Paperclip size={13} strokeWidth={1.75} />
              Attach
            </button>
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files || []);
                setAttachments(prev => [...prev, ...files]);
                e.target.value = '';
              }} />
            <button onClick={() => router.back()}
              className="px-4 py-2 text-sm font-sans text-ink-soft hover:text-ink transition-colors">
              Discard
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
