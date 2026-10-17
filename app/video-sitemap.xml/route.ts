import { getAdminDb } from '@/lib/firebase/admin';

export const revalidate = 3600;
const BASE = 'https://afrobs.com';

function xml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function isoDate(value: unknown): string {
  const date = value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate()
    : value instanceof Date ? value : typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export async function GET() {
  const entries: string[] = [];
  try {
    const db = await getAdminDb();
    const videos = await db.collection('watchVideos').where('status', '==', 'published').limit(9_000).get();
    for (const row of videos.docs) {
      const video = row.data();
      if (video.hasTrailer !== true || typeof video.title !== 'string' || typeof video.description !== 'string') continue;
      let thumbnail = '';
      try { const url = new URL(String(video.posterUrl || '')); if (url.protocol === 'https:') thumbnail = url.toString(); } catch { /* A poster is required for video search metadata. */ }
      if (!thumbnail) continue;
      const id = encodeURIComponent(row.id);
      const page = `${BASE}/african-films/${id}`;
      const player = `${BASE}/api/watch/public-preview?id=${id}`;
      const date = isoDate(video.publishedAt || video.updatedAt);
      const duration = Number(video.durationSeconds);
      entries.push(`<url><loc>${xml(page)}</loc><video:video><video:thumbnail_loc>${xml(thumbnail)}</video:thumbnail_loc><video:title>${xml(video.title)}</video:title><video:description>${xml(String(video.description).slice(0, 5000))}</video:description><video:player_loc allow_embed="yes">${xml(player)}</video:player_loc>${date ? `<video:publication_date>${xml(date)}</video:publication_date>` : ''}${Number.isFinite(duration) && duration > 0 ? `<video:duration>${Math.floor(duration)}</video:duration>` : ''}${video.category ? `<video:category>${xml(video.category)}</video:category>` : ''}</video:video></url>`);
    }
  } catch (error) {
    console.error('Video sitemap generation failed', error instanceof Error ? error.name : 'UnknownError');
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">${entries.join('')}</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
