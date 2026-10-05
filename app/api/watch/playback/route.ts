import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { watchId } from '@/lib/watch/policy';
import { watchPlayback, watchRateLimit } from '@/lib/server/watch';
import { watchActor, watchBody, watchFailure, watchJson } from '@/lib/server/watchHttp';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const actor = await watchActor(request);
    await watchRateLimit(actor, 'playback', 15);
    const data = z.object({ id: watchId, trailer: z.boolean() }).strict().parse(await watchBody(request, 1000));
    return watchJson(await watchPlayback(actor, data.id, data.trailer));
  } catch (error) { return watchFailure(error); }
}
