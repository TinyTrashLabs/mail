'use client';
/**
 * ComposeTray — bottom-pinned compose surface (Gmail-style).
 *
 * Sits over the inbox/reading-pane, doesn't take over the page. Three states:
 *   minimized  — collapsed title bar at the bottom-right
 *   normal     — ~560x500 panel anchored to the bottom-right
 *   maximized  — full-viewport overlay (for distraction-free writing)
 *
 * Drafts auto-save to localStorage on every change (key: mail_draft).
 * Send routes through /api/send like the old compose page did.
 */

import { useEffect, useRef, useState } from 'react';
import { Send, X, Paperclip, Bold, Italic, Link2, List, Save, Minus, Maximize2, Minimize2 } from 'lucide-react';
import { AIDraftAssist } from '@/components/AIDraftAssist';

export interface ComposeInit {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  inReplyTo?: string;
  onClose?: () => void;
}

type EditorMode = 'plain' | 'rich';
type TrayState = 'minimized' | 'normal' | 'maximized';

const DRAFT_KEY = 'mail_draft';

export function ComposeTray({ open, init, onClose }: { open: boolean; init: ComposeInit; onClose: () => void }) {
  const [state, setState] = useState<TrayState>('normal');
  const [to, setTo] = useState(init.to ?? '');
  const [cc, setCc] = useState(init.cc ?? '');
  const [bcc, setBcc] = useState(init.bcc ?? '');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState(init.subject ?? '');
  const [body, setBody] = useState(init.body ?? '');
  const [richBodyText, setRichBodyText] = useState('');
  const [editorMode, setEditorMode] = useState<EditorMode>('rich');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(init);

  // When `init` changes (e.g. user clicked "Reply" on a different message),
  // re-seed the fields. Reset draft state too — replying is a fresh draft.
  useEffect(() => {
    if (!open) return;
    if (init === initRef.current) return;
    initRef.current = init;
    setTo(init.to ?? '');
    setCc(init.cc ?? '');
    setBcc(init.bcc ?? '');
    setSubject(init.subject ?? '');
    setBody(init.body ?? '');
    if (editorRef.current) editorRef.current.innerHTML = (init.body ?? '').replace(/\n/g, '<br>');
    setShowCcBcc(Boolean(init.cc || init.bcc));
    setState('normal');
  }, [init, open]);

  // Restore draft on first open (only if no init fields are set — replies
  // shouldn't clobber a saved draft, but a fresh "Compose" should restore).
  const restored = useRef(false);
  useEffect(() => {
    if (!open || restored.current) return;
    if (init.to || init.subject || init.body || init.inReplyTo) { restored.current = true; return; }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setTo(d.to ?? ''); setCc(d.cc ?? ''); setBcc(d.bcc ?? '');
        setSubject(d.subject ?? ''); setBody(d.body ?? '');
        if (editorRef.current) editorRef.current.innerHTML = (d.body ?? '').replace(/\n/g, '<br>');
        setSavedAt(d.savedAt ?? null);
      }
    } catch {}
    restored.current = true;
  }, [open, init]);

  // Auto-save draft on changes (debounced by useEffect microtask batching).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          to, cc, bcc, subject, body: getBodyContent().text, savedAt: new Date().toISOString(),
        }));
        setSavedAt(new Date().toISOString());
      } catch {}
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, body, richBodyText, open]);

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

  async function send() {
    setSending(true); setError('');
    try {
      const { text, html } = getBodyContent();
      const ccList = cc.split(',').map(s => s.trim()).filter(Boolean);
      const bccList = bcc.split(',').map(s => s.trim()).filter(Boolean);
      let resp: Response;
      if (attachments.length > 0) {
        const form = new FormData();
        form.append('to', to);
        form.append('subject', subject);
        form.append('body', text);
        if (html) form.append('html', html);
        if (init.inReplyTo) form.append('inReplyTo', init.inReplyTo);
        ccList.forEach(a => form.append('cc', a));
        bccList.forEach(a => form.append('bcc', a));
        attachments.forEach(f => form.append('attachments', f));
        resp = await fetch('/api/send', { method: 'POST', body: form });
      } else {
        resp = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to, subject, body: text, html: html || undefined,
            cc: ccList.length ? ccList : undefined,
            bcc: bccList.length ? bccList : undefined,
            inReplyTo: init.inReplyTo || undefined,
          }),
        });
      }
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        setError(d.error || `Send failed (${resp.status})`);
        return;
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      onClose();
    } finally {
      setSending(false);
    }
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  }

  if (!open) return null;

  // Keyboard: Esc minimizes (when normal/max), or fully closes the second time.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (state === 'minimized') return; // don't double-handle
      setState('minimized');
    }
  }

  // Layout
  const layoutClass = state === 'minimized'
    ? 'fixed bottom-0 right-4 w-72 z-40 shadow-xl rounded-t-card'
    : state === 'maximized'
      ? 'fixed inset-0 z-40 shadow-2xl'
      : 'fixed bottom-0 right-4 w-[36rem] max-w-[calc(100vw-2rem)] h-[34rem] max-h-[calc(100vh-1rem)] z-40 shadow-xl rounded-t-card';

  const bodyEmpty = editorMode === 'rich' ? !richBodyText.trim() : !body.trim();

  return (
    <div className={layoutClass} onKeyDown={onKeyDown}>
      <div className="flex flex-col h-full bg-cream border border-rule overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-ink text-cream cursor-pointer select-none flex-shrink-0"
          onClick={() => state === 'minimized' && setState('normal')}>
          <span className="text-xs font-sans font-medium flex-1 truncate">
            {state === 'minimized'
              ? (subject || (to ? `To: ${to}` : 'New message'))
              : (init.inReplyTo ? 'Reply' : 'New message')}
          </span>
          {state !== 'minimized' && (
            <button onClick={(e) => { e.stopPropagation(); setState(state === 'maximized' ? 'normal' : 'maximized'); }}
              className="p-0.5 hover:bg-white/10 rounded" title={state === 'maximized' ? 'Restore' : 'Maximize'}>
              {state === 'maximized'
                ? <Minimize2 size={12} strokeWidth={2} />
                : <Maximize2 size={12} strokeWidth={2} />}
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); setState(state === 'minimized' ? 'normal' : 'minimized'); }}
            className="p-0.5 hover:bg-white/10 rounded" title="Minimize">
            <Minus size={12} strokeWidth={2} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-0.5 hover:bg-white/10 rounded" title="Discard & close">
            <X size={12} strokeWidth={2} />
          </button>
        </div>

        {state !== 'minimized' && (
          <>
            {error && (
              <div className="p-2 bg-err/10 border-b border-err text-xs font-sans text-err">{error}</div>
            )}

            {/* To/Cc/Bcc/Subject */}
            <div className="border-b border-rule flex-shrink-0">
              <div className="flex items-center border-b border-rule">
                <label className="px-3 py-1.5 text-[11px] font-sans font-medium text-ink-soft w-14 flex-shrink-0">To</label>
                <input value={to} onChange={e => setTo(e.target.value)} type="email"
                  className="flex-1 bg-transparent px-2 py-1.5 text-xs font-sans text-ink focus:outline-none placeholder:text-ink-soft/50"
                  placeholder="recipient@example.com" autoFocus={!to} />
                <button onClick={() => setShowCcBcc(v => !v)}
                  className="px-2 py-1.5 text-[11px] font-sans text-ink-soft hover:text-ink transition-colors flex-shrink-0">
                  CC/BCC
                </button>
              </div>
              {showCcBcc && (
                <>
                  <div className="flex items-center border-b border-rule">
                    <label className="px-3 py-1 text-[11px] font-sans font-medium text-ink-soft w-14 flex-shrink-0">CC</label>
                    <input value={cc} onChange={e => setCc(e.target.value)} type="email" multiple
                      className="flex-1 bg-transparent px-2 py-1 text-xs font-sans text-ink focus:outline-none placeholder:text-ink-soft/50"
                      placeholder="cc@example.com" />
                  </div>
                  <div className="flex items-center border-b border-rule">
                    <label className="px-3 py-1 text-[11px] font-sans font-medium text-ink-soft w-14 flex-shrink-0">BCC</label>
                    <input value={bcc} onChange={e => setBcc(e.target.value)} type="email" multiple
                      className="flex-1 bg-transparent px-2 py-1 text-xs font-sans text-ink focus:outline-none placeholder:text-ink-soft/50"
                      placeholder="bcc@example.com" />
                  </div>
                </>
              )}
              <div className="flex items-center">
                <label className="px-3 py-1.5 text-[11px] font-sans font-medium text-ink-soft w-14 flex-shrink-0">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  className="flex-1 bg-transparent px-2 py-1.5 text-xs font-sans text-ink focus:outline-none placeholder:text-ink-soft/50"
                  placeholder="Subject" />
              </div>
            </div>

            {/* Editor mode + toolbar */}
            <div className="flex items-center gap-1 px-3 py-1 border-b border-rule bg-[#f0ede4]/50 flex-shrink-0">
              {(['rich', 'plain'] as EditorMode[]).map(mode => (
                <button key={mode} type="button" onClick={() => setEditorMode(mode)}
                  className={`text-[11px] px-2 py-0.5 rounded font-sans transition-colors capitalize ${editorMode === mode ? 'bg-teal text-cream' : 'text-ink-soft hover:text-ink'}`}>
                  {mode === 'rich' ? 'HTML' : 'Plain'}
                </button>
              ))}
              {editorMode === 'rich' && (
                <>
                  <div className="w-px h-3 bg-rule mx-1" />
                  <button type="button" onMouseDown={e => { e.preventDefault(); execFormat('bold'); }} className="p-1 rounded hover:bg-rule text-ink-soft" title="Bold">
                    <Bold size={11} strokeWidth={2} />
                  </button>
                  <button type="button" onMouseDown={e => { e.preventDefault(); execFormat('italic'); }} className="p-1 rounded hover:bg-rule text-ink-soft" title="Italic">
                    <Italic size={11} strokeWidth={2} />
                  </button>
                  <button type="button" onMouseDown={e => {
                    e.preventDefault();
                    const url = prompt('URL:');
                    if (url) execFormat('createLink', url);
                  }} className="p-1 rounded hover:bg-rule text-ink-soft" title="Link">
                    <Link2 size={11} strokeWidth={2} />
                  </button>
                  <button type="button" onMouseDown={e => { e.preventDefault(); execFormat('insertUnorderedList'); }} className="p-1 rounded hover:bg-rule text-ink-soft" title="List">
                    <List size={11} strokeWidth={2} />
                  </button>
                </>
              )}
              <div className="flex-1" />
              {savedAt && (
                <span className="text-[10px] text-ink-soft font-sans flex items-center gap-1">
                  <Save size={10} strokeWidth={1.75} /> Draft saved
                </span>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {editorMode === 'rich' ? (
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => setRichBodyText(editorRef.current?.innerText || '')}
                  className="min-h-full px-3 py-3 text-xs font-sans text-ink focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-ink-soft/50"
                  data-placeholder="Write your message…"
                  style={{ whiteSpace: 'pre-wrap' }}
                />
              ) : (
                <textarea value={body} onChange={e => setBody(e.target.value)}
                  className="w-full h-full bg-transparent px-3 py-3 text-xs font-mono text-ink focus:outline-none resize-none placeholder:text-ink-soft/50"
                  placeholder="Write your message…" />
              )}
            </div>

            {/* AI assist + attachments */}
            <div className="px-3 py-1.5 border-t border-rule flex-shrink-0 bg-[#f0ede4]/30">
              <AIDraftAssist to={to} subject={subject} onDraft={handleDraft} />
              {attachments.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {attachments.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] font-sans text-ink">
                      <Paperclip size={10} strokeWidth={1.75} className="text-ink-soft" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-ink-soft">{(f.size / 1024).toFixed(1)}KB</span>
                      <button onClick={() => removeAttachment(i)} className="text-ink-soft hover:text-err">
                        <X size={10} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Send bar */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-rule bg-[#f0ede4] flex-shrink-0">
              <button onClick={send} disabled={sending || !to || !subject || bodyEmpty}
                title={!to ? 'Add a recipient' : !subject ? 'Add a subject' : bodyEmpty ? 'Add a body' : 'Send (Cmd+Enter)'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal hover:bg-teal-strong disabled:opacity-50 disabled:cursor-not-allowed text-cream rounded-card text-xs font-sans font-medium transition-colors">
                <Send size={11} strokeWidth={2} />
                {sending ? 'Sending…' : 'Send'}
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="p-1.5 border border-rule rounded-card text-ink-soft hover:text-ink hover:bg-rule transition-colors" title="Attach">
                <Paperclip size={12} strokeWidth={1.75} />
              </button>
              <input ref={fileRef} type="file" multiple className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  setAttachments(prev => [...prev, ...files]);
                  e.target.value = '';
                }} />
              <div className="flex-1" />
              <button onClick={onClose} className="text-[11px] font-sans text-ink-soft hover:text-ink">
                Discard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
