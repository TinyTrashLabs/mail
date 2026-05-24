'use client';

/**
 * ProfileClient — edit profile page body.
 * Shows current avatar (large, editable via crop modal), display name (read-only,
 * sourced from Mattermost), and username / email for reference.
 */

import { useState } from 'react';
import { UserAvatar } from '@/components/UserAvatar';
import { User, Mail, AtSign, Info } from 'lucide-react';

interface Props {
  username: string;
  displayName: string;
  email?: string;
}

export function ProfileClient({ username, displayName, email }: Props) {
  const [avatarKey, setAvatarKey] = useState(0);

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-serif font-semibold text-ink mb-8">Profile</h1>

      {/* Avatar section */}
      <div className="bg-[#f0ede4] rounded-card border border-rule p-6 mb-6">
        <h2 className="text-sm font-sans font-semibold text-ink-soft uppercase tracking-wide mb-4">Photo</h2>
        <div className="flex items-center gap-6">
          {/* Large editable avatar */}
          <UserAvatar
            key={avatarKey}
            username={username}
            displayName={displayName}
            size={80}
            editable
            className="flex-shrink-0"
          />
          <div>
            <p className="text-sm font-sans text-ink font-medium mb-1">Profile photo</p>
            <p className="text-xs font-sans text-ink-soft">
              Hover over your photo and click the camera icon to upload a new one.
              Drag to reposition and zoom to fit.
            </p>
          </div>
        </div>
      </div>

      {/* Identity — read-only (sourced from Mattermost) */}
      <div className="bg-[#f0ede4] rounded-card border border-rule p-6 mb-6">
        <h2 className="text-sm font-sans font-semibold text-ink-soft uppercase tracking-wide mb-4">Identity</h2>
        <div className="space-y-4">
          <Field icon={User} label="Display name" value={displayName} />
          <Field icon={AtSign} label="Username" value={username} />
          {email && <Field icon={Mail} label="Email" value={email} />}
        </div>
        <div className="mt-4 flex items-start gap-2 px-3 py-2.5 bg-teal/10 rounded-card border border-teal/20">
          <Info size={13} strokeWidth={2} className="text-teal flex-shrink-0 mt-0.5" />
          <p className="text-xs font-sans text-teal-strong">
            Name and email are managed through your Mattermost profile.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={14} strokeWidth={1.75} className="text-ink-soft flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-sans text-ink-soft uppercase tracking-wide">{label}</p>
        <p className="text-sm font-sans text-ink truncate">{value}</p>
      </div>
    </div>
  );
}
