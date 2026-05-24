'use client';

/**
 * ComposeDrawer — Gmail-style floating compose panel.
 *
 * States:
 *   minimized  – tray bar at bottom-right, click to expand
 *   expanded   – full floating compose panel (≈450×580px)
 *   popout     – opens /compose in a new window; drawer closes
 *
 * Usage:
 *   const { openDrawer, ComposeDrawer } = useComposeDrawer();
 *   // mount <ComposeDrawer /> once in the layout
 *   // call openDrawer({ to, subject, inReplyTo }) to open
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, Minus, ExternalLink, Send, Paperclip, Bold, Italic,
  Link2, List, Save,
} from 'lucide-react';
import { AIDraftAssist } from '@/components/AIDraftAssist';
import { RecipientChips } from '@/components/RecipientChips';

// ─── Types ──────────────────────────────────────────────────────────────────

type DrawerState = 'closed' | 'minimized' | 'expanded';
type EditorMode = 'rich' | 'plain';

export interface ComposeDrawerOptions {
  to?: string;
  subject?: string;
  inReplyTo?: string;
  draftId?: number;
  body?: string;
  html?: string;
}

// ─── Context (simple singleton via module-level ref) ─────────────────────────
// We expose a hook that triggers a global event so Sidebar + InboxClient
// can open the drawer without prop-drilling.

const OPEN_EVENT = 'compose:open';

export function openComposeDrawer(opts: ComposeDrawerOptions = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: opts }));
}

// ─── Rich editor toolbar ─────────────────────────────────────────────────────

function RichToolbar({ onFormat }: { onFormat: (cmd: string, val?: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-rule bg-[#f0ede4]">
      <button type="button" onMouseDown={e => { e.preventDefault(); onFormat('bold'); }}
        className="p-1 rounded hover:bg-rule text-ink-soft hover:text-ink transition-colors" title="Bold">
        <Bold size={12} strokeWidth={2} />
      </button>
      <button type="button" onMouseDown={e => { e.preventDefault(); onFormat('italic'); }}
        className="p-1 rounded hover:bg-rule text-ink-soft hover:text-ink transition-colors" title="Italic">
        <Italic size={12} strokeWidth={2} />
      </button>
      <button type="button" onMouseDown={e => {
        e.preventDefault();
        const raw = prompt('URL:');
        // Reject javascript: and data: URLs to prevent XSS via execCommand('createLink')
        if (raw && /^(https?|mailto):/i.test(raw.trim())) onFormat('createLink', raw.trim());
        else if (raw) alert('Only http://, https://, and mailto: URLs are allowed.');
      }} className="p-1 rounded hover:bg-rule text-ink-soft hover:text-ink transition-colors" title="Link">
        <Link2 size={12} strokeWidth={2} />
      </button>
      <button type="button" onMouseDown={e => { e.preventDefault(); onFormat('insertUnorderedList'); }}
        className="p-1 rounded hover:bg-rule text-ink-soft hover:text-ink transition-colors" title="List">
        <List size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ComposeDrawer() {
  const [drawerState, setDrawerState] = useState<DrawerState>('closed');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [richBodyText, setRichBodyText] = useState('');
  const [editorMode, setEditorMode] = useState<EditorMode>('rich');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [error, setError] = useState('');
  const [inReplyTo, setInReplyTo] = useState('');
  const [draftId, setDraftId] = useState<number | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Listen for open events from anywhere in the app
  useEffect(() => {
    const handler = (e: Event) => {
      const opts = (e as CustomEvent<ComposeDrawerOptions>).detail ?? {};
      setTo(opts.to ?? '');
      setSubject(opts.subject ?? '');
      setInReplyTo(opts.inReplyTo ?? '');
      setCc('');
      setBcc('');
      setDraftId(opts.draftId ?? null);
      // Restore body from draft if provided
      const bodyText = opts.body ?? '';
      const htmlContent = opts.html ?? '';
      setBody(bodyText);
      if (editorRef.current) {
        if (htmlContent) {
          editorRef.current.innerHTML = htmlContent;
          setRichBodyText(editorRef.current.innerText || bodyText);
        } else if (bodyText) {
          // Render plain text safely as text nodes
          const div = document.createElement('div');
          bodyText.split('\n').forEach((line, i, arr) => {
            div.appendChild(document.createTextNode(line));
            if (i < arr.length - 1) div.appendChild(document.createElement('br'));
          });
          editorRef.current.innerHTML = '';
          editorRef.current.appendChild(div);
          setRichBodyText(editorRef.current.innerText || bodyText);
        } else {
          editorRef.current.innerHTML = '';
          setRichBodyText('');
        }
      } else {
        setRichBodyText(bodyText);
      }
      setError('');
      setAttachments([]);
      setShowCcBcc(false);
      setDrawerState('expanded');
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  const close = useCallback(() => {
    setDrawerState('closed');
  }, []);

  const minimize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDrawerState('minimized');
  }, []);

  const expand = useCallback(() => {
    setDrawerState('expanded');
  }, []);

  const popout = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const params = new URLSearchParams();
    if (to) params.set('replyTo', to);
    if (subject) params.set('subject', subject);
    if (inReplyTo) params.set('inReplyTo', inReplyTo);
    params.set('popup', '1');
    window.open(
      `/compose?${params.toString()}`,
      'compose',
      'width=680,height=640,resizable=yes,scrollbars=yes'
    );
    setDrawerState('closed');
  }, [to, subject, inReplyTo]);

  function execFormat(cmd: string, val?: string) {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  }

  function getBodyContent(): { text: string; html: string | null } {
    if (editorMode === 'rich' && editorRef.current) {
      return {
        text: editorRef.current.innerText || '',
        html: editorRef.current.innerHTML,
      };
    }
    return { text: body, html: null };
  }

  function handleDraft(draft: string) {
    if (editorMode === 'rich' && editorRef.current) {
      // Treat AI output as plain text — escape before inserting to avoid XSS.
      // We render it as text nodes so no HTML from the model ever executes.
      const div = document.createElement('div');
      draft.split('\n').forEach((line, i, arr) => {
        div.appendChild(document.createTextNode(line));
        if (i < arr.length - 1) div.appendChild(document.createElement('br'));
      });
      editorRef.current.innerHTML = '';
      editorRef.current.appendChild(div);
      setRichBodyText(editorRef.current.innerText || draft);
    } else {
      setBody(draft);
    }
  }

  async function saveDraft() {
    const { text, html } = getBodyContent();
    const payload = { to, cc, bcc, subject, text, html: html || null, inReplyTo: inReplyTo || null };
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
      // Also clear the old localStorage draft if present
      try { localStorage.removeItem('mail_draft'); } catch {}
      setSavedDraft(true);
      setTimeout(() => setSavedDraft(false), 2000);
    } catch {
      setError('Could not save draft.');
    }
  }

  async function send() {
    setSending(true);
    setError('');
    try {
      const { text, html } = getBodyContent();
      const ccList = cc.split(',').map(s => s.trim()).filter(Boolean);
      const bccList = bcc.split(',').map(s => s.trim()).filter(Boolean);

      let resp: Response;
      try {
        if (attachments.length > 0) {
          const form = new FormData();
          form.append('to', to);
          form.append('subject', subject);
          form.append('body', text);
          if (html) form.append('html', html);
          if (inReplyTo) form.append('inReplyTo', inReplyTo);
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
              inReplyTo: inReplyTo || undefined,
            }),
          });
        }
      } catch {
        setError('Network error — check your connection and try again.');
        return;
      }

      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        setError(d.error || 'Send failed');
        return;
      }

      try { localStorage.removeItem('mail_draft'); } catch {}
      // Delete server-side draft if one was saved
      if (draftId !== null) {
        fetch(`/api/drafts/${draftId}`, { method: 'DELETE' }).catch(() => {});
        setDraftId(null);
      }
      setDrawerState('closed');
    } finally {
      setSending(false);
    }
  }

  const bodyEmpty = editorMode === 'rich' ? !richBodyText.trim() : !body.trim();

  if (drawerState === 'closed') return null;

  // ── Minimized tray bar ────────────────────────────────────────────────────
  if (drawerState === 'minimized') {
    return (
      <div className="fixed bottom-0 right-6 z-50 flex items-stretch rounded-t-card shadow-xl overflow-hidden min-w-[200px]">
        {/* Expand area — click to expand */}
        <button
          onClick={expand}
          className="flex items-center gap-2 pl-4 pr-2 py-2.5 bg-ink text-cream text-sm font-sans font-medium hover:bg-ink/90 transition-colors flex-1"
        >
          <Send size={13} strokeWidth={1.75} className="text-teal flex-shrink-0" />
          <span className="truncate flex-1 text-left">{subject || 'New message'}</span>
        </button>
        {/* Popout */}
        <button
          type="button"
          title="Pop out"
          onClick={popout}
          className="flex items-center px-2 py-2.5 bg-ink hover:bg-ink/90 text-cream/60 hover:text-cream transition-colors"
        >
          <ExternalLink size={12} strokeWidth={1.75} />
        </button>
        {/* Close */}
        <button
          type="button"
          title="Close"
          onClick={close}
          className="flex items-center px-2 py-2.5 bg-ink hover:bg-ink/90 text-cream/60 hover:text-cream transition-colors"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>
    );
  }

  // ── Expanded floating panel ───────────────────────────────────────────────
  return (
    <div
      className="fixed bottom-0 right-6 z-50 flex flex-col bg-cream border border-rule rounded-t-card shadow-2xl"
      style={{ width: 'min(460px, calc(100vw - 48px))', height: 'min(580px, calc(100vh - 80px))' }}
    >
      {/* ── Header bar — sibling elements, no nested interactive controls ── */}
      <div className="flex items-stretch bg-ink text-cream rounded-t-card flex-shrink-0">
        {/* Clickable title area → minimize */}
        <button
          type="button"
          onClick={minimize}
          className="flex items-center gap-2 pl-4 pr-2 py-2.5 flex-1 text-left hover:bg-white/5 transition-colors cursor-pointer select-none"
          title="Minimize"
        >
          <Send size={13} strokeWidth={1.75} className="text-teal flex-shrink-0" />
          <span className="flex-1 text-sm font-sans font-medium truncate">{subject || 'New message'}</span>
        </button>
        {/* Action buttons — siblings, not children of the title button */}
        <button
          type="button"
          title="Minimize"
          onClick={minimize}
          className="px-2 py-2.5 hover:bg-white/10 text-cream/60 hover:text-cream transition-colors"
        >
          <Minus size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          title="Pop out"
          onClick={popout}
          className="px-2 py-2.5 hover:bg-white/10 text-cream/60 hover:text-cream transition-colors"
        >
          <ExternalLink size={13} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Close"
          onClick={close}
          className="px-2 py-2.5 hover:bg-white/10 text-cream/60 hover:text-cream transition-colors rounded-tr-card"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {/* ── Fields area ── */}
      <div className="flex flex-col flex-1 overflow-hidden divide-y divide-rule">
        {/* To */}
        <div className="flex items-start flex-shrink-0">
          <label className="px-3 py-2 text-xs font-sans font-medium text-ink-soft w-12 flex-shrink-0">To</label>
          <RecipientChips
            value={to}
            onChange={setTo}
            placeholder="recipient@example.com"
            ariaLabel="Recipient"
            autoFocus={!to}
          />
          <button
            onClick={() => setShowCcBcc(v => !v)}
            className="px-2 py-2 text-xs font-sans text-ink-soft hover:text-ink transition-colors flex-shrink-0"
          >
            CC/BCC
          </button>
        </div>

        {showCcBcc && (
          <>
            <div className="flex items-start flex-shrink-0">
              <label className="px-3 py-2 text-xs font-sans font-medium text-ink-soft w-12 flex-shrink-0">CC</label>
              <RecipientChips value={cc} onChange={setCc} placeholder="cc@example.com" ariaLabel="CC" />
            </div>
            <div className="flex items-start flex-shrink-0">
              <label className="px-3 py-2 text-xs font-sans font-medium text-ink-soft w-12 flex-shrink-0">BCC</label>
              <RecipientChips value={bcc} onChange={setBcc} placeholder="bcc@example.com" ariaLabel="BCC" />
            </div>
          </>
        )}

        {/* Subject */}
        <div className="flex items-center flex-shrink-0">
          <label className="px-3 py-2 text-xs font-sans font-medium text-ink-soft w-12 flex-shrink-0">Subject</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="flex-1 bg-transparent px-2 py-2 text-sm font-sans text-ink focus:outline-none placeholder:text-ink-soft/50"
            placeholder="Subject"
          />
          <div className="flex items-center gap-0.5 px-2 flex-shrink-0">
            {(['rich', 'plain'] as EditorMode[]).map(mode => (
              <button key={mode} type="button" onClick={() => setEditorMode(mode)}
                className={`text-[10px] px-1.5 py-0.5 rounded font-sans transition-colors ${editorMode === mode ? 'bg-teal text-cream' : 'text-ink-soft hover:text-ink'}`}>
                {mode === 'rich' ? 'HTML' : 'TXT'}
              </button>
            ))}
          </div>
        </div>

        {/* Rich toolbar */}
        {editorMode === 'rich' && <RichToolbar onFormat={execFormat} />}

        {/* Body — flex-1 so it fills remaining height */}
        <div className="flex-1 overflow-y-auto">
          {editorMode === 'rich' ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => setRichBodyText(editorRef.current?.innerText || '')}
              className="w-full h-full min-h-[120px] px-3 py-3 text-sm font-sans text-ink focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-ink-soft/50"
              data-placeholder="Write your message…"
              style={{ whiteSpace: 'pre-wrap' }}
            />
          ) : (
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              className="w-full h-full min-h-[120px] bg-transparent px-3 py-3 text-sm font-mono text-ink focus:outline-none resize-none placeholder:text-ink-soft/50"
              placeholder="Write your message…"
            />
          )}
        </div>

        {/* AI draft assist (compact) */}
        {(to || subject) && (
          <div className="flex-shrink-0 px-3 pb-1">
            <AIDraftAssist to={to} subject={subject} onDraft={handleDraft} />
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="flex-shrink-0 px-3 py-1.5 space-y-0.5 border-t border-rule">
            {attachments.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs font-sans text-ink">
                <Paperclip size={10} strokeWidth={1.75} className="text-ink-soft" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-ink-soft text-[10px]">({(f.size / 1024).toFixed(1)}KB)</span>
                <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))} className="text-ink-soft hover:text-err">
                  <X size={10} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex-shrink-0 px-3 py-1.5 text-xs font-sans text-err bg-err/10">{error}</div>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#f0ede4] flex-shrink-0">
          <button
            onClick={send}
            disabled={sending || !to || !subject || bodyEmpty}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-teal hover:bg-teal-strong disabled:opacity-50 disabled:cursor-not-allowed text-cream rounded-card text-xs font-sans font-medium transition-colors"
          >
            <Send size={11} strokeWidth={2} />
            {sending ? 'Sending…' : 'Send'}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-rule transition-colors"
            title="Attach file"
          >
            <Paperclip size={13} strokeWidth={1.75} />
          </button>
          <input ref={fileRef} type="file" multiple className="hidden"
            onChange={e => {
              setAttachments(prev => [...prev, ...Array.from(e.target.files || [])]);
              e.target.value = '';
            }} />
          <button
            onClick={saveDraft}
            className="flex items-center gap-1 text-xs font-sans text-ink-soft hover:text-ink transition-colors ml-auto"
            title="Save draft"
          >
            <Save size={11} strokeWidth={1.75} />
            {savedDraft ? 'Saved!' : 'Draft'}
          </button>
          <button
            onClick={close}
            className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-rule transition-colors"
            title="Discard"
          >
            <X size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
