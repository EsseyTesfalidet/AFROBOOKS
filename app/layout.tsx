import type { Metadata, Viewport } from 'next';
import './globals.css';
import './app-appearance.css';
import './app-themes.css';
import AuthProvider from '@/components/shared/AuthProvider';
import AgreementGate from '@/components/legal/AgreementGate';
import AuthWelcome from '@/components/shared/AuthWelcome';
import AppExperience from '@/components/shared/AppExperience';
import ConnectionStatus from '@/components/shared/ConnectionStatus';
import MobileKeyboard from '@/components/shared/MobileKeyboard';
import ServiceWorkerRegistration from '@/components/shared/ServiceWorkerRegistration';
import MobileAccessGate from '@/components/auth/MobileAccessGate';
import { APP_MODE_BOOTSTRAP } from '@/lib/app/installed';
import { APP_APPEARANCE_BOOTSTRAP } from '@/lib/app/appearance';
import MobileAppShell from '@/components/shared/MobileAppShell';
import AuthorReturnBar from '@/components/shared/AuthorReturnBar';
import AccountRouteGate from '@/components/auth/AccountRouteGate';
import { BRAND_DESCRIPTION, BRAND_NAME } from '@/lib/brand';

export const viewport: Viewport = {
  themeColor: '#0e0e0e',
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  applicationName: BRAND_NAME,
  appleWebApp: { title: BRAND_NAME },
  title: {
    default: `${BRAND_NAME} | African Books, Films, Music & Stories`,
    template: `%s — ${BRAND_NAME}`,
  },
  description: BRAND_DESCRIPTION,
  keywords: ['African books', 'African authors', 'African literature', 'African films', 'African music', 'African podcasts', 'African audiobooks', 'AfroNarra'],
  authors: [{ name: BRAND_NAME }],
  creator: BRAND_NAME,
  publisher: BRAND_NAME,
  metadataBase: new URL('https://afrobs.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://afrobs.com',
    siteName: BRAND_NAME,
    title: `${BRAND_NAME} | African Books, Films, Music & Stories`,
    description: 'Discover African books, magazines, films, music, podcasts and audiobooks from African authors and creators.',
    images: [{ url: '/pwa-512x512.png?v=2', width: 512, height: 512, alt: BRAND_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND_NAME} | African Books, Films, Music & Stories`,
    description: 'Read, watch and listen to stories from African authors and creators.',
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script id="afrobooks-app-mode" dangerouslySetInnerHTML={{ __html: APP_MODE_BOOTSTRAP + ';' + APP_APPEARANCE_BOOTSTRAP }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND_NAME,
          url: 'https://afrobs.com/',
        }) }} />
      </head>
      <body className="bg-[#0e0e0e] text-[#f5f2eb] font-body antialiased">
        <ServiceWorkerRegistration />
        <ConnectionStatus />
        <MobileKeyboard />
        <AuthorReturnBar />
        <AuthProvider>
          <MobileAppShell>
            <MobileAccessGate>
              <AppExperience />
              <AccountRouteGate><AgreementGate>{children}<AuthWelcome /></AgreementGate></AccountRouteGate>
            </MobileAccessGate>
          </MobileAppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
