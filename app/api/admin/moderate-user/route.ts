import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { deleteUserRecords } from '@/lib/server/moderation';

type ModerationAction = 'active' | 'warned' | 'suspended' | 'delete';

function getStatusNotification(action: Exclude<ModerationAction, 'delete'>) {
  if (action === 'active') {
    return {
      title: 'Account Restored',
      message: 'Your account access has been restored. You can continue using the app normally.',
    };
  }

  if (action === 'warned') {
    return {
      title: 'Account Warning',
      message: 'Your account received a warning. Review the platform rules to avoid further action.',
    };
  }

  return {
    title: 'Account Suspended',
    message: 'Your account has been suspended. Contact support if you believe this was a mistake.',
  };
}

export async function POST(request: NextRequest) {
  try {
    const requestUser = await requireRequestUser(request);
    if (requestUser.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { uid, action } = (await request.json()) as {
      uid?: string;
      action?: ModerationAction;
    };

    if (!uid || !action) {
      return NextResponse.json({ error: 'Missing moderation payload' }, { status: 400 });
    }

    const adminDb = await getAdminDb();
    const adminAuth = await getAdminAuth();
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userSnap.data() as { role?: string };

    if (userData.role === 'admin' && action === 'delete') {
      return NextResponse.json({ error: 'Admin accounts cannot be deleted here' }, { status: 400 });
    }

    if (action === 'delete') {
      const result = await deleteUserRecords(adminDb, adminAuth, uid);
      return NextResponse.json({ ok: true, deleted: result.deleted, deletedBookCount: result.deletedBookCount });
    }

    const notification = getStatusNotification(action);

    await userRef.update({
      status: action,
      updatedAt: new Date(),
    });

    await adminDb.collection('notifications').add({
      userId: uid,
      type: 'system',
      title: notification.title,
      message: notification.message,
      isRead: false,
      actionUrl: null,
      relatedBookId: null,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true, status: action });
  } catch (error) {
    console.error('moderate-user error:', error);
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Unable to update account moderation' },
      { status }
    );
  }
}
