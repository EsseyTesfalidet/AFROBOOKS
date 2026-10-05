import type { NextRequest } from 'next/server';
import { watchAction, watchRateLimit } from '@/lib/server/watch';
import { watchActor, watchBody, watchFailure, watchJson } from '@/lib/server/watchHttp';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const actor = await watchActor(request, true);
    await watchRateLimit(actor, 'action', 30);
    return watchJson(await watchAction(actor, await watchBody(request)));
  } catch (error) { return watchFailure(error); }
}
