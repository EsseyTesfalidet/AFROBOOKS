import type { NextRequest } from 'next/server';
import { experienceCollections, experienceContinue, experiencePreferences, experienceWrite, playlistTitles, mediaCards } from '@/lib/server/experience';
import { watchActor, watchBody, watchJson, watchFailure } from '@/lib/server/watchHttp';
import { watchRateLimit } from '@/lib/server/watch';
import { getAdminDb } from '@/lib/firebase/admin';
import { WatchError } from '@/lib/server/watchErrors';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const actor = await watchActor(request); await watchRateLimit(actor, 'experience_read', 120);
    const view = request.nextUrl.searchParams.get('view');
    if (view === 'continue') return watchJson(await experienceContinue(actor));
    if (view === 'collections' || view === 'editor') return watchJson(await experienceCollections(actor, view === 'editor'));
    if (view === 'playlist_titles') return watchJson(await playlistTitles(actor));
    if (view === 'catalog') {
      if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.');
      const kind = request.nextUrl.searchParams.get('kind');
      if (kind !== 'book' && kind !== 'audio' && kind !== 'video') throw new WatchError(400, 'Choose a format.');
      const db = await getAdminDb(); const after = request.nextUrl.searchParams.get('after');
      let query = db.collection(({ book:'books', video:'watchVideos', audio:'audioTitles' })[kind]).where('status', '==', kind === 'book' ? 'live' : 'published').orderBy('__name__');
      if (after) { if (!/^[\w-]{1,128}$/.test(after)) throw new WatchError(400, 'Invalid page.'); query = query.startAfter(after); }
      const rows = await query.limit(41).get(); const page = rows.docs.slice(0,40);
      return watchJson({ items: await mediaCards(page.map(row => ({ kind, id:row.id }))), next:rows.size>40?page[39].id:null });
    }
    return watchJson(await experiencePreferences(actor));
  } catch (error) { return watchFailure(error); }
}
export async function POST(request: NextRequest) {
  try { const actor = await watchActor(request, true); await watchRateLimit(actor, 'experience_write', 60); return watchJson(await experienceWrite(actor, await watchBody(request, 32000))); }
  catch (error) { return watchFailure(error); }
}
