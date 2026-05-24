'use client';

/**
 * UserAvatar — displays a user's avatar image (from /api/avatar?user=<username>)
 * with an initials fallback.
 *
 * When `editable` is true, clicking the avatar opens a file picker and uploads
 * the selected image to POST /api/avatar. Used in the sidebar for the current user.
 */

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Camera } from 'lucide-react';

interface UserAvatarProps {
  username: string;
  displayName?: string;
  size?: number;        // px — default 32
  editable?: boolean;  // show upload affordance on hover
  className?: string;
}

const PALETTE = [
  'bg-teal-strong', 'bg-[#6db28b]', 'bg-[#d8a14a]',
  'bg-[#7b8bb3]',   'bg-[#b37b9e]',
];

function avatarBg(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

export function UserAvatar({ username, displayName, size = 32, editable = false, className = '' }: UserAvatarProps) {
  const [hasImage, setHasImage] = useState(true);   // optimistic: try img first
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState(0);         // bump to bust cache after upload
  const fileRef = useRef<HTMLInputElement>(null);

  const label = displayName || username;
  const src = `/api/avatar?user=${encodeURIComponent(username)}&v=${version}`;

  async function handleFile(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await fetch('/api/avatar', { method: 'POST', body: fd });
      if (res.ok) {
        setHasImage(true);
        setVersion(v => v + 1);
      }
    } finally {
      setUploading(false);
    }
  }

  const sizeClass = `w-[${size}px] h-[${size}px]`;
  const roundedCls = 'rounded-full overflow-hidden flex-shrink-0';
  const bgCls = avatarBg(username);

  return (
    <div
      className={`relative inline-flex ${roundedCls} ${className}`}
      style={{ width: size, height: size }}
    >
      {hasImage ? (
        <Image
          src={src}
          alt={label}
          width={size}
          height={size}
          className="object-cover rounded-full"
          onError={() => setHasImage(false)}
          unoptimized
        />
      ) : (
        <div
          className={`${bgCls} w-full h-full flex items-center justify-center text-cream font-bold select-none`}
          style={{ fontSize: Math.round(size * 0.38) }}
          aria-label={label}
        >
          {initials(label)}
        </div>
      )}

      {/* Upload overlay — only when editable */}
      {editable && (
        <>
          <button
            type="button"
            title="Change avatar"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 rounded-full flex items-center justify-center bg-ink/0 hover:bg-ink/40 transition-colors group"
            aria-label="Upload avatar"
          >
            <Camera
              size={Math.round(size * 0.38)}
              strokeWidth={2}
              className="text-cream opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </>
      )}

      {/* Upload spinner */}
      {uploading && (
        <div className="absolute inset-0 rounded-full bg-ink/50 flex items-center justify-center">
          <div className="w-3 h-3 border-2 border-cream border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
