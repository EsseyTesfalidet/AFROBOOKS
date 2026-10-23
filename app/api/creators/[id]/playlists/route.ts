import { NextResponse } from 'next/server';
import { publicCreatorPlaylists } from '@/lib/server/experience';
import { watchFailure } from '@/lib/server/watchHttp';

export const runtime = 'nodejs';
export const revalidate = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const playlists = await publicCreatorPlaylists(id);
    return NextResponse.json({ playlists }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } });
  } catch (error) {
    return watchFailure(error);
  }
}
