import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { watchId } from '@/lib/watch/policy';
import { watchFeedPreview, watchPlayback, watchRateLimit } from '@/lib/server/watch';
import { watchActor, watchBody, watchFailure, watchJson } from '@/lib/server/watchHttp';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const actor = await watchActor(request);
    const data = z.object({ id: watchId, trailer: z.boolean(), preview: z.boolean().default(false) }).strict().parse(await watchBody(request, 1000));
    await watchRateLimit(actor, data.preview ? 'feed-preview' : 'playback', data.preview ? 40 : 15);
    if (data.preview) return watchJson(await watchFeedPreview(actor, data.id));
    return watchJson(await watchPlayback(actor, data.id, data.trailer));
  } catch (error) { return watchFailure(error); }
}
