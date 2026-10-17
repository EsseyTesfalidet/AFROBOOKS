import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/browse', '/discover', '/subscription', '/watch', '/listen', '/terms', '/privacy', '/about-help', '/book/', '/author/'],
        disallow: [
          '/admin',
          '/dashboard',
          '/listings',
          '/analytics',
          '/earnings',
          '/publish',
          '/library',
          '/cart',
          '/checkout',
          '/read/',
          '/profile/',
          '/notifications',
        ],
      },
    ],
    sitemap: 'https://afrobs.com/sitemap.xml',
  };
}
