import type { NextRequest } from 'next/server';
import { generateAudioSample } from '@/lib/server/audioSample';
import { watchActor, watchBody, watchJson } from '@/lib/server/watchHttp';
import { watchRateLimit } from '@/lib/server/watch';
import { audioId } from '@/lib/audio/policy';
import { WatchError } from '@/lib/server/watchErrors';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const actor = await watchActor(request, true); await watchRateLimit(actor, 'audio_sample', 6);
    const { id } = await watchBody(request, 2000);
    return watchJson(await generateAudioSample(actor, audioId.parse(id)));
  } catch (error) {
    if (error instanceof WatchError) return watchJson({ error: error.message }, error.status);
    return watchJson({ error: 'Unable to prepare this sample. Please sign in and try again.' }, 400);
  }
}
