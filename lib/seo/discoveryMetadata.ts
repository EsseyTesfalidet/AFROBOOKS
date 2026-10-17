import type { Metadata } from 'next';

export function discoveryMetadata(title: string, description: string, path: string): Metadata {
  const brandedTitle = `${title} — AfroBooks`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', title: brandedTitle, description, url: path, images: [{ url: '/pwa-512x512.png?v=2', width: 512, height: 512, alt: 'AfroBooks' }] },
    twitter: { card: 'summary_large_image', title: brandedTitle, description, images: ['/pwa-512x512.png?v=2'] },
  };
}
