import type { NextRequest } from 'next/server';
import { setWatchPoster, watchRateLimit } from '@/lib/server/watch';
import { watchActor, watchBytes, watchFailure, watchJson } from '@/lib/server/watchHttp';
import { WatchError } from '@/lib/server/watchErrors';
import { watchId } from '@/lib/watch/policy';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const actor = await watchActor(request, true);
    await watchRateLimit(actor, 'poster', 5);
    const bytes = await watchBytes(request, 3_100_000);
    const body = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
    const id = watchId.parse(body.get('id')); const file = body.get('file');
    if (!(file instanceof File) || file.size > 3_000_000) throw new WatchError(400, 'Choose an image smaller than 3 MB.');
    return watchJson(await setWatchPoster(actor, id, Buffer.from(await file.arrayBuffer())));
  } catch (error) { return watchFailure(error); }
}
