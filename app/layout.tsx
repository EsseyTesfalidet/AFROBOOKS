import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthProvider from '@/components/shared/AuthProvider';
import AgreementGate from '@/components/legal/AgreementGate';
import AuthWelcome from '@/components/shared/AuthWelcome';
import AppExperience from '@/components/shared/AppExperience';
import ServiceWorkerRegistration from '@/components/shared/ServiceWorkerRegistration';

export const viewport: Viewport = {
  themeColor: '#0e0e0e',
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: {
    default: 'AfroBooks — Africa\'s Boldest Ebook Marketplace',
    template: '%s — AfroBooks',
  },
  description: 'Discover and read ebooks by African authors. Browse thousands of titles across fiction, history, science, and more. Africa\'s boldest ebook marketplace.',
  keywords: ['African ebooks', 'African authors', 'ebook marketplace', 'African literature', 'buy ebooks online', 'AfroBooks'],
  authors: [{ name: 'AfroBooks' }],
  creator: 'AfroBooks',
  publisher: 'AfroBooks',
  metadataBase: new URL('https://afrobs.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://afrobs.com',
    siteName: 'AfroBooks',
    title: 'AfroBooks — Africa\'s Boldest Ebook Marketplace',
    description: 'Discover and read ebooks by African authors. Browse thousands of titles across fiction, history, science, and more.',
    images: [{ url: '/pwa-512x512.png?v=2', width: 512, height: 512, alt: 'AfroBooks' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AfroBooks — Africa\'s Boldest Ebook Marketplace',
    description: 'Discover and read ebooks by African authors.',
    images: ['/pwa-512x512.png?v=2'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg?v=2', type: 'image/svg+xml' },
      { url: '/pwa-192x192.png?v=2', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png?v=2',
    shortcut: '/favicon.svg?v=2',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0e0e0e] text-[#f5f2eb] font-body antialiased">
        <ServiceWorkerRegistration />
        <AppExperience />
        <AuthProvider>
          <AgreementGate>{children}<AuthWelcome /></AgreementGate>
        </AuthProvider>
      </body>
    </html>
  );
}
