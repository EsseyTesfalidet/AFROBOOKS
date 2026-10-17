import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { watchId } from '@/lib/watch/policy';
import { getPublicTrailerEmbedUrl } from '@/lib/server/watch';
import { WatchError } from '@/lib/server/watchErrors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This endpoint can issue a token only for an approved, published trailer.
// Full-length Cloudflare asset IDs and paid playback tokens are never exposed.
export async function GET(request: NextRequest) {
  const parsed = z.string().max(128).pipe(watchId).safeParse(request.nextUrl.searchParams.get('id'));
  if (!parsed.success) return NextResponse.json({ error: 'This trailer is unavailable.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
  try {
    const url = await getPublicTrailerEmbedUrl(parsed.data);
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
  } catch (error) {
    if (error instanceof WatchError && error.status === 404) return NextResponse.json({ error: 'This trailer is unavailable.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
    console.error('Public trailer preview failed', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'The trailer is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
  }
}
