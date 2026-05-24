'use client';

/**
 * AvatarCropModal — appears after a user picks an image file.
 * Shows a circular preview, lets them drag to reposition and use a slider
 * to zoom, then POSTs the cropped result to /api/avatar.
 *
 * Usage:
 *   <AvatarCropModal file={file} onClose={() => setFile(null)} onSaved={() => bump()} />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Check, Loader2 } from 'lucide-react';

interface Props {
  file: File;
  onClose: () => void;
  onSaved: () => void;
}

const SIZE = 256; // output square in px
const PREVIEW = 240; // canvas px shown in modal

export function AvatarCropModal({ file, onClose, onSaved }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Crop state
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Load image from File
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Fit image to canvas initially (cover)
      const scale = Math.max(PREVIEW / img.naturalWidth, PREVIEW / img.naturalHeight);
      setZoom(scale);
      setOffset({ x: 0, y: 0 });
      setLoadError(false);
    };
    img.onerror = () => setLoadError(true);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Draw onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, PREVIEW, PREVIEW);
    const w = img.naturalWidth * zoom;
    const h = img.naturalHeight * zoom;
    const x = (PREVIEW - w) / 2 + offset.x;
    const y = (PREVIEW - h) / 2 + offset.y;
    ctx.drawImage(img, x, y, w, h);
    // Dim outside circle
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, PREVIEW, PREVIEW);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(PREVIEW / 2, PREVIEW / 2, PREVIEW / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Circle border
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(PREVIEW / 2, PREVIEW / 2, PREVIEW / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [zoom, offset]);

  // Re-draw when image loads
  useEffect(() => {
    if (imgRef.current) {
      setOffset(o => ({ ...o })); // nudge to trigger redraw
    }
  }, [zoom]);

  // Drag handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  }, [dragging]);

  const onMouseUp = useCallback(() => {
    setDragging(false);
    dragStart.current = null;
  }, []);

  // Touch drag
  const touchStart = useRef<{ tx: number; ty: number; ox: number; oy: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { tx: t.clientX, ty: t.clientY, ox: offset.x, oy: offset.y };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    setOffset({
      x: touchStart.current.ox + (t.clientX - touchStart.current.tx),
      y: touchStart.current.oy + (t.clientY - touchStart.current.ty),
    });
  };

  async function save() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    // Render at full SIZE × SIZE for upload
    const out = document.createElement('canvas');
    out.width = SIZE;
    out.height = SIZE;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    const scale = SIZE / PREVIEW;
    const w = img.naturalWidth * zoom * scale;
    const h = img.naturalHeight * zoom * scale;
    const x = (SIZE - w) / 2 + offset.x * scale;
    const y = (SIZE - h) / 2 + offset.y * scale;

    // Clip to circle then draw
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);

    setSaving(true);
    try {
      const blob = await new Promise<Blob>((res, rej) =>
        out.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.9)
      );
      const fd = new FormData();
      fd.append('avatar', blob, 'avatar.jpg');
      const resp = await fetch('/api/avatar', { method: 'POST', body: fd });
      if (resp.ok) {
        onSaved();
        onClose();
      } else {
        const d = await resp.json().catch(() => ({}));
        alert(d.error || 'Upload failed');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-cream rounded-card shadow-xl p-6 flex flex-col items-center gap-4 w-80"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full">
          <span className="text-sm font-serif font-semibold text-ink">Position your photo</span>
          <button onClick={onClose} className="text-ink-soft hover:text-ink transition-colors" aria-label="Close">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {loadError ? (
          <div className="text-xs text-warn text-center py-8">Couldn't load that image. Try a JPEG or PNG.</div>
        ) : (
          <>
            {/* Canvas crop area */}
            <div className="relative" style={{ width: PREVIEW, height: PREVIEW }}>
              <canvas
                ref={canvasRef}
                width={PREVIEW}
                height={PREVIEW}
                className="rounded-full"
                style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={() => { touchStart.current = null; }}
              />
            </div>

            {/* Zoom slider */}
            <div className="flex items-center gap-3 w-full">
              <ZoomOut size={14} strokeWidth={2} className="text-ink-soft flex-shrink-0" />
              <input
                type="range"
                min={0.1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                className="flex-1 accent-teal"
              />
              <ZoomIn size={14} strokeWidth={2} className="text-ink-soft flex-shrink-0" />
            </div>

            <p className="text-[11px] text-ink-soft text-center">Drag to reposition · zoom to fit</p>

            {/* Actions */}
            <div className="flex gap-3 w-full">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-card border border-rule text-sm font-sans text-ink-soft hover:text-ink hover:bg-rule transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 rounded-card bg-teal text-cream text-sm font-sans font-medium hover:bg-teal-strong transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Check size={14} strokeWidth={2} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
