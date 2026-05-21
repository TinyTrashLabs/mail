import type { Metadata } from 'next';
import './globals.css';
import Provider from './session-provider';

export const metadata: Metadata = {
  title: 'TTL Mail',
  description: 'Tiny Trash Labs email viewer',
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
