import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { deleteUserRecords } from '@/lib/server/moderation';

export async function DELETE(request: NextRequest) {
  try {
    const requestUser = await requireRequestUser(request);
    const adminDb = await getAdminDb();
    const adminAuth = await getAdminAuth();
    const result = await deleteUserRecords(adminDb, adminAuth, requestUser.uid);

    if (!result.deleted) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      deletedBookCount: result.deletedBookCount,
    });
  } catch (error) {
    console.error('account delete error:', error);
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500;

    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Unable to delete account' },
      { status }
    );
  }
}
