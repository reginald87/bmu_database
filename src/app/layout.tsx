import type { Metadata } from 'next';
import './globals.css';
import './polish.css';

export const metadata: Metadata = {
  title: 'BMU Secure Database',
  description: 'Bayelsa Medical University secure student and staff records database.',
  icons: {
    icon: '/crest.png',
    shortcut: '/crest.png',
    apple: '/crest.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
