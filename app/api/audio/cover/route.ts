import type { NextRequest } from 'next/server';
import { setAudioCover } from '@/lib/server/audioCover';
import { watchRateLimit } from '@/lib/server/watch';
import { watchActor, watchBody, watchBytes, watchFailure, watchJson } from '@/lib/server/watchHttp';
import { WatchError } from '@/lib/server/watchErrors';
import { audioId } from '@/lib/audio/policy';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const actor = await watchActor(request, true); await watchRateLimit(actor, 'audio-cover', 10);
    const bytes = await watchBytes(request, 3_100_000);
    const body = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
    const id = audioId.parse(body.get('id')); const file = body.get('file');
    if (!(file instanceof File) || file.size > 3_000_000) throw new WatchError(400, 'Choose an image smaller than 3 MB.');
    return watchJson(await setAudioCover(actor, id, Buffer.from(await file.arrayBuffer())));
  } catch (error) { return watchFailure(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    const actor = await watchActor(request, true); await watchRateLimit(actor, 'audio-cover', 10);
    const body = await watchBody(request, 2048) as { id?: unknown };
    return watchJson(await setAudioCover(actor, audioId.parse(body.id), null));
  } catch (error) { return watchFailure(error); }
}
