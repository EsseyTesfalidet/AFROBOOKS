import type { NextRequest } from 'next/server';
import { audioAction, audioDetail, audioFinances, audioList, audioPlayback } from '@/lib/server/audio';
import { watchActor, watchBody, watchJson } from '@/lib/server/watchHttp';
import { watchRateLimit } from '@/lib/server/watch';
import { WatchError } from '@/lib/server/watchErrors';
import { ZodError } from 'zod';
export const runtime = 'nodejs';
function failure(error: unknown) {
  if (error instanceof WatchError) return watchJson({ error: error.message }, error.status);
  if (error instanceof ZodError) return watchJson({ error: error.issues[0]?.message || 'Check the audio details.' }, 400);
  if (error instanceof Error && error.message === 'Unauthorized') return watchJson({ error: 'Please sign in to continue.' }, 401);
  console.error('Audio request failed', error instanceof Error ? error.name : 'UnknownError');
  return watchJson({ error: 'Audio is temporarily unavailable. Please try again.' }, 500);
}
export async function GET(request: NextRequest) {
  try {
    const actor = await watchActor(request); await watchRateLimit(actor, 'audio_read', 120);
    const params = request.nextUrl.searchParams;
    if (params.get('view') === 'detail') return watchJson(await audioDetail(actor, params.get('id') || ''));
    if (params.get('view') === 'finances') return watchJson(await audioFinances(actor));
    return watchJson(params.get('view') === 'playback' ? await audioPlayback(actor, params.get('id') || '') : await audioList(actor, params.get('view') || 'catalog', params.get('after')));
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try { const actor = await watchActor(request, true); await watchRateLimit(actor, 'audio_write', 40); return watchJson(await audioAction(actor, await watchBody(request, 16000))); }
  catch (error) { return failure(error); }
}
