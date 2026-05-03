import type { Metadata } from 'next';
import './globals.css';
import AuthProvider from '@/components/shared/AuthProvider';

export const metadata: Metadata = {
  title: 'AfroBooks — Africa\'s Boldest Ebook Marketplace',
  description: 'Browse, purchase, and read ebooks by African authors. In-app reading only.',
  manifest: '/manifest.json',
  themeColor: '#0e0e0e',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/pwa-192x192.png',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0e0e0e] text-[#f5f2eb] font-body antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
