import type { NextRequest } from 'next/server';
import { getWatchAdmin, getWatchCatalog, getWatchDetail, getWatchHostingStatus, getWatchLibrary, getWatchStudio, watchRateLimit } from '@/lib/server/watch';
import { watchActor, watchFailure, watchJson } from '@/lib/server/watchHttp';
import { WatchError } from '@/lib/server/watchErrors';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const actor = await watchActor(request); const params = request.nextUrl.searchParams;
    await watchRateLimit(actor, 'read', 120);
    switch (params.get('view') || 'catalog') {
      case 'catalog': return watchJson(await getWatchCatalog(actor, params.get('after'), params.get('creator')));
      case 'detail': return watchJson(await getWatchDetail(actor, params.get('id') || ''));
      case 'library': return watchJson(await getWatchLibrary(actor));
      case 'studio': return watchJson(await getWatchStudio(actor));
      case 'admin': return watchJson(await getWatchAdmin(actor));
      case 'hosting': return watchJson(await getWatchHostingStatus(actor));
      default: throw new WatchError(400, 'Unknown video view.');
    }
  } catch (error) { return watchFailure(error); }
}
