import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { getAdminDb } from '@/lib/firebase/admin';

export async function POST(request: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const user = await requireRequestUser(request);
    const { bookId } = await params;
    const db = await getAdminDb();
    await db.runTransaction(async tx => {
      const ref = db.doc(`books/${bookId}`);
      const [book, deletion] = await Promise.all([tx.get(ref), tx.get(db.doc(`bookDeletions/${bookId}`))]);
      if (!book.exists || deletion.exists || book.data()?.sellerId !== user.uid) throw new Error('Unauthorized');
      tx.update(ref, { status: 'draft', copyrightReviewStatus: 'not_needed', publishedAt: null, updatedAt: new Date() });
    });
    return NextResponse.json({ status: 'draft' });
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 403 : 500;
    return NextResponse.json({ error: 'Unable to open this book for editing.' }, { status });
  }
}
