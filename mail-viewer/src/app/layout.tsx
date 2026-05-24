import type { Metadata, Viewport } from 'next';
import './globals.css';
import Provider from './session-provider';

export const metadata: Metadata = {
  title: 'TTL Mail',
  description: 'Tiny Trash Labs email',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/ttl-mascot-logo.png',
  },
};

// Size viewport to device width and prevent the browser from applying an
// initial scale different from 1:1. We intentionally do NOT set maximumScale
// or userScalable — disabling user zoom is a WCAG 1.4.4 violation and is
// unnecessary once all form inputs are ≥16px (see globals.css), which is what
// actually prevents iOS Safari from zooming on focus.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-ink font-serif min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
