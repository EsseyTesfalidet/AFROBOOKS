import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';

type ReportPayload = {
  targetType?: 'book' | 'review' | 'user';
  targetId?: string;
  targetName?: string;
  reason?: string;
};

export async function POST(request: NextRequest) {
  try {
    const requestUser = await requireRequestUser(request);
    const { targetType, targetId, targetName, reason } = (await request.json()) as ReportPayload;

    if (!targetType || !targetId || !targetName || !reason) {
      return NextResponse.json({ error: 'Missing report payload' }, { status: 400 });
    }

    const adminDb = await getAdminDb();
    const userSnap = await adminDb.collection('users').doc(requestUser.uid).get();
    const userData = userSnap.data() as { firstName?: string; lastName?: string } | undefined;
    const reporterName = [userData?.firstName, userData?.lastName].filter(Boolean).join(' ').trim() || requestUser.email || 'Reader';

    await adminDb.collection('reports').add({
      reporterId: requestUser.uid,
      reporterName,
      targetType,
      targetId,
      targetName,
      reason,
      status: 'open',
      adminNote: null,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: new Date(),
    });

    if (targetType === 'book') {
      const bookRef = adminDb.collection('books').doc(targetId);
      const bookSnap = await bookRef.get();

      if (bookSnap.exists) {
        const bookData = bookSnap.data() as {
          flagCount?: number;
          flagReason?: string | null;
          status?: string;
          sellerId?: string;
          title?: string;
        };

        const nextFlagCount = (bookData.flagCount ?? 0) + 1;
        const isCopyrightConcern = reason.toLowerCase().includes('copyright');
        const shouldEscalate = isCopyrightConcern || nextFlagCount >= 3;
        const bookUpdates: Record<string, unknown> = {
          flagCount: nextFlagCount,
          flagReason: isCopyrightConcern
            ? 'Possible copyright infringement reported by a reader.'
            : bookData.flagReason ?? 'Reader reports require moderator review.',
          status: shouldEscalate ? 'flagged' : bookData.status ?? 'live',
          updatedAt: new Date(),
        };

        if (isCopyrightConcern) {
          bookUpdates.copyrightReviewStatus = 'flagged';
        }

        await bookRef.set(bookUpdates, { merge: true });

        if (shouldEscalate && bookData.sellerId) {
          await adminDb.collection('notifications').add({
            userId: bookData.sellerId,
            type: 'system',
            title: isCopyrightConcern ? 'Copyright Review Started' : 'Book Sent to Review',
            message: isCopyrightConcern
              ? `Your book "${bookData.title ?? targetName}" is hidden while the team reviews a copyright concern.`
              : `Your book "${bookData.title ?? targetName}" is under moderation review after reader reports.`,
            isRead: false,
            actionUrl: '/listings',
            relatedBookId: targetId,
            createdAt: new Date(),
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('report create error:', error);
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Unable to submit report' },
      { status }
    );
  }
}
