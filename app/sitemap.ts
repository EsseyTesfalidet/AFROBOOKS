import type { MetadataRoute } from 'next';
import { getAdminDb } from '@/lib/firebase/admin';

const BASE = 'https://afrobs.com';
// Keep each catalog slice comfortably below Google's 50,000 URL sitemap cap.
// If the catalog grows past these limits, split it into multiple sitemap files.
const SECTION_LIMIT = 9_000;
export const revalidate = 3600;

type SitemapRecord = {
  url: string;
  lastModified?: Date;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: number;
};

function lastModified(value: unknown): Date | undefined {
  let date: Date | undefined;
  if (value instanceof Date) date = value;
  else if (typeof value === 'number' && Number.isFinite(value)) date = new Date(value);
  else if (typeof value === 'string') date = new Date(value);
  else if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    date = value.toDate();
  }
  return date && Number.isFinite(date.getTime()) ? date : undefined;
}

function contentUrl(path: string, id: string) {
  return `${BASE}${path}/${encodeURIComponent(id)}`;
}

const publicPages: SitemapRecord[] = [
  { url: BASE, changeFrequency: 'daily', priority: 1 },
  { url: `${BASE}/african-books`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${BASE}/african-films`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${BASE}/african-music`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${BASE}/african-podcasts`, changeFrequency: 'daily', priority: 0.8 },
  { url: `${BASE}/african-audiobooks`, changeFrequency: 'daily', priority: 0.8 },
  { url: `${BASE}/african-audio`, changeFrequency: 'daily', priority: 0.8 },
  { url: `${BASE}/african-creators`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${BASE}/browse`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${BASE}/discover`, changeFrequency: 'daily', priority: 0.8 },
  { url: `${BASE}/about-help`, changeFrequency: 'monthly', priority: 0.5 },
  { url: `${BASE}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${BASE}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const db = await getAdminDb();
    const [bookRows, videoRows, audioRows] = await Promise.all([
      db.collection('books').where('status', '==', 'live').limit(SECTION_LIMIT).get(),
      db.collection('watchVideos').where('status', '==', 'published').limit(SECTION_LIMIT).get(),
      db.collection('audioTitles').where('status', '==', 'published').limit(SECTION_LIMIT).get(),
    ]);

    const liveBooks = bookRows.docs.filter(row => row.data().deletionPending !== true);
    const authorIds = [...new Set(liveBooks.map(row => row.data().sellerId).filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const profileDocs = [];
    for (let offset = 0; offset < authorIds.length; offset += 100) {
      const ids = authorIds.slice(offset, offset + 100);
      profileDocs.push(...await db.getAll(...ids.map(id => db.collection('users').doc(id))));
    }
    const publicAuthorIds = new Set(profileDocs.flatMap(profile => {
      const user = profile.data();
      return user && ['seller', 'both'].includes(user.role) && !['banned', 'suspended'].includes(user.status)
        ? [profile.id]
        : [];
    }));

    const videoCreatorIds = [...new Set(videoRows.docs.map(row => row.data().creatorId).filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const creatorDocs = [];
    for (let offset = 0; offset < videoCreatorIds.length; offset += 100) {
      const ids = videoCreatorIds.slice(offset, offset + 100);
      creatorDocs.push(...await db.getAll(...ids.map(id => db.doc(`watchCreators/${id}`))));
    }
    const approvedCreatorIds = new Set(creatorDocs.flatMap(creator => creator.data()?.status === 'approved' ? [creator.id] : []));

    const content: SitemapRecord[] = [
      ...liveBooks.map(row => ({
        url: contentUrl('/african-books', row.id),
        lastModified: lastModified(row.data().updatedAt || row.data().publishedAt),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
      ...[...publicAuthorIds].map(id => ({
        url: contentUrl('/author', id),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
      ...videoRows.docs.map(row => ({
        url: contentUrl('/african-films', row.id),
        lastModified: lastModified(row.data().updatedAt || row.data().publishedAt),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
      ...[...approvedCreatorIds].map(id => ({
        url: `${BASE}/african-creators/${encodeURIComponent(id)}`,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      })),
      ...audioRows.docs.filter(row => row.data().ready === true).map(row => ({
        url: `${BASE}/african-audio/${encodeURIComponent(row.id)}`,
        lastModified: lastModified(row.data().updatedAt),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      })),
    ];

    // Thirteen public pages plus five bounded groups of 9,000 stay below the 50,000 URL cap.
    return [...publicPages, ...content].slice(0, 45_013);
  } catch {
    // Keep the sitemap available if Firebase is temporarily unavailable. The
    // static storefront pages remain discoverable and content entries return
    // after the next successful revalidation.
    return publicPages;
  }
}
