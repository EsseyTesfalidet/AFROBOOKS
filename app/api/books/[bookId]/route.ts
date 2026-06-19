import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { deleteBookRecords } from '@/lib/server/moderation';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ bookId: string }> }
) {
  try {
    const requestUser = await requireRequestUser(request);
    const { bookId } = await context.params;

    if (!bookId) {
      return NextResponse.json({ error: 'Missing book id' }, { status: 400 });
    }

    const adminDb = await getAdminDb();
    const bookRef = adminDb.collection('books').doc(bookId);
    const bookSnap = await bookRef.get();

    if (!bookSnap.exists) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const book = bookSnap.data() as { sellerId?: string };
    const isOwner = book.sellerId === requestUser.uid;
    const isAdmin = requestUser.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'You do not have permission to remove this book.' }, { status: 403 });
    }

    await deleteBookRecords(adminDb, bookId);

    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    console.error('book delete error:', error);
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Unable to remove this book.' },
      { status }
    );
  }
}
