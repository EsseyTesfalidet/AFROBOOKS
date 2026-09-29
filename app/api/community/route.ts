import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { CommunityError, communityFeed, communityThread, mutateCommunity } from '@/lib/server/community';
import type { CommunityReport } from '@/types/community';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof CommunityError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check your request and try again.' }, { status: 400 });
  if (error instanceof Error && (error.message === 'Unauthorized' || ('code' in error && String(error.code).startsWith('auth/')))) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });
  console.error('Community request failed', error instanceof Error ? error.name : 'unknown');
  return NextResponse.json({ error: 'Community is temporarily unavailable. Please try again.' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const admin = params.get('view') === 'admin';
    if (admin && (await requireRequestUser(request)).role !== 'admin') throw new CommunityError('Administrator access required.', 403);
    const db = await getAdminDb();
    const postId = params.get('postId');
    const cursor = params.get('cursor');
    if (postId) return NextResponse.json(await communityThread(db, postId, cursor, admin, params.get('replyId')), { headers: { 'Cache-Control': 'no-store' } });
    const kind = params.get('kind') ?? 'weekly';
    if (kind !== 'weekly' && kind !== 'memory') throw new CommunityError('Unknown community section.');
    const feed = await communityFeed(db, kind, cursor, admin);
    if (admin) {
      const reports = await db.collection('communityReports').where('status', '==', 'open').orderBy('createdAt').limit(50).get();
      feed.reports = reports.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, postId: data.postId, replyId: data.replyId, reason: data.reason, createdAt: data.createdAt } as CommunityReport;
      });
    }
    return NextResponse.json(feed, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRequestUser(request);
    const raw = await request.text();
    if (raw.length > 16000) throw new CommunityError('Your contribution is too long.', 413);
    return NextResponse.json(await mutateCommunity(await getAdminDb(), user.uid, JSON.parse(raw)));
  } catch (error) { return failure(error); }
}
