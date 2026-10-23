import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/browse', '/discover', '/terms', '/privacy', '/about-help', '/book/', '/author/', '/african-books', '/african-films', '/african-music', '/african-podcasts', '/african-audiobooks', '/african-audio', '/african-creators', '/tigrinya-books', '/african-documentaries', '/api/watch/public-preview', '/api/audio/public-preview'],
        disallow: [
          '/api/',
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
          '/watch',
          '/listen',
          '/subscription',
        ],
      },
    ],
    sitemap: ['https://afrobs.com/sitemap.xml', 'https://afrobs.com/video-sitemap.xml'],
  };
}
