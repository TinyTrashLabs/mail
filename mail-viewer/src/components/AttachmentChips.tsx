'use client';

import { useState } from 'react';
import { Paperclip, X, Download, ExternalLink } from 'lucide-react';

interface AttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
}

interface Props {
  messageId: number;
  attachments: AttachmentMeta[];
}

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp|svg\+xml)$/i;
const PDF_TYPE = /^application\/pdf$/i;
const TEXT_TYPE = /^text\//i;

function isPreviewable(ct: string) {
  return IMAGE_TYPES.test(ct) || PDF_TYPE.test(ct) || TEXT_TYPE.test(ct);
}

function attachmentUrl(messageId: number, idx: number) {
  return `/api/messages/${messageId}/attachments/${idx}`;
}

export function AttachmentChips({ messageId, attachments }: Props) {
  const [preview, setPreview] = useState<{
    idx: number;
    url: string;
    contentType: string;
    filename: string;
  } | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function openPreview(idx: number, meta: AttachmentMeta) {
    const url = attachmentUrl(messageId, idx);
    if (TEXT_TYPE.test(meta.contentType)) {
      setLoading(true);
      try {
        const r = await fetch(url);
        const text = await r.text();
        setTextContent(text);
      } finally {
        setLoading(false);
      }
    } else {
      setTextContent(null);
    }
    setPreview({ idx, url, contentType: meta.contentType, filename: meta.filename });
  }

  function closePreview() {
    setPreview(null);
    setTextContent(null);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a, i) => {
          const canPreview = isPreviewable(a.contentType);
          const sizeLabel =
            a.size < 1024
              ? `${a.size} B`
              : a.size < 1024 * 1024
              ? `${(a.size / 1024).toFixed(1)} KB`
              : `${(a.size / (1024 * 1024)).toFixed(1)} MB`;

          return (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f0ede4] hover:bg-rule border border-rule rounded-card text-xs font-sans text-ink transition-colors group"
            >
              <Paperclip size={11} strokeWidth={1.75} className="text-ink-soft flex-shrink-0" />
              {canPreview ? (
                <button
                  type="button"
                  onClick={() => openPreview(i, a)}
                  className="truncate max-w-[16rem] hover:text-teal transition-colors text-left"
                  title={`Preview ${a.filename}`}
                >
                  {a.filename}
                </button>
              ) : (
                <span className="truncate max-w-[16rem]">{a.filename}</span>
              )}
              <span className="text-ink-soft flex-shrink-0">{sizeLabel}</span>
              <a
                href={attachmentUrl(messageId, i)}
                download={a.filename}
                onClick={e => e.stopPropagation()}
                className="ml-0.5 text-ink-soft hover:text-ink transition-colors flex-shrink-0"
                title="Download"
              >
                <Download size={11} strokeWidth={1.75} />
              </a>
            </div>
          );
        })}
      </div>

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4"
          onClick={closePreview}
        >
          <div
            className="bg-cream rounded-card shadow-2xl flex flex-col max-h-[90vh] max-w-4xl w-full overflow-hidden border border-rule"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-rule flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip size={14} strokeWidth={1.75} className="text-ink-soft flex-shrink-0" />
                <span className="text-sm font-sans font-medium text-ink truncate">
                  {preview.filename}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <a
                  href={preview.url}
                  download={preview.filename}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-sans text-ink-soft hover:text-ink border border-rule rounded-card transition-colors"
                >
                  <Download size={12} strokeWidth={1.75} />
                  Download
                </a>
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-sans text-ink-soft hover:text-ink border border-rule rounded-card transition-colors"
                >
                  <ExternalLink size={12} strokeWidth={1.75} />
                  Open
                </a>
                <button
                  onClick={closePreview}
                  className="p-1.5 text-ink-soft hover:text-ink transition-colors"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-auto min-h-0 flex items-center justify-center p-4">
              {loading ? (
                <span className="text-ink-soft text-sm font-sans animate-pulse">Loading…</span>
              ) : IMAGE_TYPES.test(preview.contentType) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={preview.filename}
                  className="max-w-full max-h-full object-contain rounded"
                />
              ) : PDF_TYPE.test(preview.contentType) ? (
                <iframe
                  src={preview.url}
                  title={preview.filename}
                  className="w-full h-full min-h-[60vh] rounded border border-rule"
                />
              ) : TEXT_TYPE.test(preview.contentType) && textContent !== null ? (
                <pre className="w-full whitespace-pre-wrap font-mono text-xs text-ink leading-relaxed overflow-auto max-h-[60vh] p-4 bg-[#f0ede4] rounded border border-rule">
                  {textContent}
                </pre>
              ) : (
                <div className="text-center text-ink-soft text-sm font-sans">
                  <Paperclip size={32} strokeWidth={1} className="mx-auto mb-2 opacity-40" />
                  <p>No preview available.</p>
                  <a
                    href={preview.url}
                    download={preview.filename}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 bg-teal text-cream rounded-card text-xs font-medium hover:bg-teal-strong transition-colors"
                  >
                    <Download size={13} strokeWidth={2} />
                    Download file
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
