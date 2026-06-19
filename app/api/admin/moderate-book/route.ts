import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { deleteBookRecords } from '@/lib/server/moderation';

type ModerationAction = 'live' | 'delete';

export async function POST(request: NextRequest) {
  try {
    const requestUser = await requireRequestUser(request);
    if (requestUser.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { bookId, action } = (await request.json()) as {
      bookId?: string;
      action?: ModerationAction;
    };

    if (!bookId || !action) {
      return NextResponse.json({ error: 'Missing moderation payload' }, { status: 400 });
    }

    const adminDb = await getAdminDb();
    const bookRef = adminDb.collection('books').doc(bookId);
    const bookSnap = await bookRef.get();

    if (!bookSnap.exists) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const book = bookSnap.data() as {
      sellerId: string;
      title: string;
      publishedAt?: unknown;
    };

    if (action === 'delete') {
      await deleteBookRecords(adminDb, bookId);

      await adminDb.collection('notifications').add({
        userId: book.sellerId,
        type: 'system',
        title: 'Book Removed',
        message: `Your book "${book.title}" has been removed from the platform by the moderation team.`,
        isRead: false,
        actionUrl: '/listings',
        relatedBookId: null,
        createdAt: new Date(),
      });

      return NextResponse.json({ ok: true, deleted: true });
    }

    await bookRef.update({
      status: 'live',
      publishedAt: book.publishedAt ?? new Date(),
      flagReason: null,
      flagCount: 0,
      updatedAt: new Date(),
    });

    await adminDb.collection('notifications').add({
      userId: book.sellerId,
      type: 'system',
      title: 'Book Approved',
      message: `Your book "${book.title}" is now live in the reader catalog.`,
      isRead: false,
      actionUrl: '/listings',
      relatedBookId: bookId,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true, status: 'live' });
  } catch (error) {
    console.error('moderate-book error:', error);
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Unable to update book moderation' },
      { status }
    );
  }
}
