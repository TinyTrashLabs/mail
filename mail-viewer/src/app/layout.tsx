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

// Lock mobile viewport to device size (Gmail mobile parity).
// width=device-width sizes the canvas to the device.
// initialScale=1 prevents iOS zoom-out on landing.
// maximumScale=1 + userScalable=false disables pinch-zoom on mobile mail.
// Note: iOS zoom-on-focus is killed by inputs being >=16px — see globals.css.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
