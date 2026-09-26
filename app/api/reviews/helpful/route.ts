import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    const user = await requireRequestUser(req);
    const { reviewId } = await req.json();
    if (typeof reviewId !== 'string' || !reviewId || reviewId.includes('/')) return NextResponse.json({ error: 'Invalid review' }, { status: 400 });
    const db = await getAdminDb();
    const ref = db.collection('reviews').doc(reviewId);
    const voteRef = ref.collection('helpfulVotes').doc(user.uid);
    await db.runTransaction(async (tx) => {
      const [review, vote] = await Promise.all([tx.get(ref), tx.get(voteRef)]);
      if (!review.exists || review.data()?.status !== 'active') throw new Error('Review unavailable');
      if (vote.exists) return;
      tx.create(voteRef, { createdAt: new Date() });
      tx.update(ref, { helpfulCount: FieldValue.increment(1) });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Unable to mark review helpful' }, { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 400 });
  }
}
