import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { publishBook } from '@/lib/server/publishBook';
import { BookContentError } from '@/lib/server/bookContent';

export async function POST(request: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const user = await requireRequestUser(request);
    if (!['seller', 'both', 'admin'].includes(user.role)) return NextResponse.json({ error: 'Author account required' }, { status: 403 });
    const { bookId } = await params;
    const status = await publishBook(await getAdminDb(), bookId, user.uid);
    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof BookContentError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Book publication failed:', error);
    return NextResponse.json({ error: 'Unable to publish this book. Your draft has been saved.' }, { status: 500 });
  }
}
