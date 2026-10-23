import { NextResponse, type NextRequest } from 'next/server';
import { audioId } from '@/lib/audio/policy';
import { getPublicAudioSampleUrl } from '@/lib/server/publicAudioSample';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' };

export async function GET(request: NextRequest) {
  const parsed = audioId.safeParse(request.nextUrl.searchParams.get('id'));
  if (!parsed.success) return NextResponse.json({ error: 'This sample is unavailable.' }, { status: 404, headers });
  try {
    const url = await getPublicAudioSampleUrl(parsed.data);
    return url ? NextResponse.redirect(url, { status: 302, headers }) : NextResponse.json({ error: 'This sample is unavailable.' }, { status: 404, headers });
  } catch {
    return NextResponse.json({ error: 'The sample is temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
}
