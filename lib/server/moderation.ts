import type { User } from '@/types/user';
import type { Book } from '@/types/book';
import { countsTowardSellerVerificationBookLimit } from '@/lib/sellerVerification';
import type { Auth } from 'firebase-admin/auth';
import type {
  DocumentReference,
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';

const DELETE_BATCH_SIZE = 400;

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function deleteDocumentRefs(adminDb: Firestore, refs: DocumentReference[]) {
  for (const chunk of chunkItems(refs, DELETE_BATCH_SIZE)) {
    const batch = adminDb.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteQueryDocuments(
  adminDb: Firestore,
  query: Query,
  predicate?: (doc: QueryDocumentSnapshot) => boolean
) {
  const snapshot = await query.get();
  const refs = (predicate ? snapshot.docs.filter(predicate) : snapshot.docs).map((doc) => doc.ref);
  await deleteDocumentRefs(adminDb, refs);
  return refs.length;
}

async function deleteReportsForTargets(
  adminDb: Firestore,
  targetIds: string[],
  targetType: 'book' | 'review' | 'user'
) {
  if (!targetIds.length) return 0;

  let deletedCount = 0;

  for (const chunk of chunkItems(Array.from(new Set(targetIds)), 10)) {
    const snapshot = await adminDb.collection('reports').where('targetId', 'in', chunk).get();
    const refs = snapshot.docs
      .filter((doc) => doc.data().targetType === targetType)
      .map((doc) => doc.ref);

    await deleteDocumentRefs(adminDb, refs);
    deletedCount += refs.length;
  }

  return deletedCount;
}

async function syncSellerVerificationStatus(adminDb: Firestore, sellerId: string) {
  const sellerRef = adminDb.collection('sellers').doc(sellerId);
  const [sellerSnap, booksSnap] = await Promise.all([
    sellerRef.get(),
    adminDb.collection('books').where('sellerId', '==', sellerId).get(),
  ]);

  if (!sellerSnap.exists) return;

  const qualifyingBookCount = booksSnap.docs
    .map((doc) => doc.data() as Pick<Book, 'status' | 'isPreorder'>)
    .filter(countsTowardSellerVerificationBookLimit).length;

  const sellerData = sellerSnap.data() as { verificationStatus?: Record<string, unknown> };
  const verificationStatus = sellerData.verificationStatus ?? {};
  const nextFirstBookPublished = qualifyingBookCount > 0;

  if (verificationStatus.firstBookPublished === nextFirstBookPublished) {
    return;
  }

  await sellerRef.set(
    {
      verificationStatus: {
        ...verificationStatus,
        firstBookPublished: nextFirstBookPublished,
      },
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

export async function recalculateBookReviewStats(adminDb: Firestore, bookId: string) {
  const bookRef = adminDb.collection('books').doc(bookId);
  const [bookSnap, reviewsSnap] = await Promise.all([
    bookRef.get(),
    adminDb.collection('reviews').where('bookId', '==', bookId).get(),
  ]);

  if (!bookSnap.exists) return;

  const activeReviews = reviewsSnap.docs
    .map((doc) => doc.data() as { stars?: number; status?: string })
    .filter((review) => review.status === 'active' && typeof review.stars === 'number');

  const reviewCount = activeReviews.length;
  const averageRating =
    reviewCount > 0
      ? activeReviews.reduce((sum, review) => sum + (review.stars ?? 0), 0) / reviewCount
      : 0;

  await bookRef.update({
    reviewCount,
    averageRating,
    updatedAt: new Date(),
  });
}

export async function deleteBookRecords(
  adminDb: Firestore,
  bookId: string,
  options?: { skipSellerVerificationSync?: boolean }
) {
  const bookRef = adminDb.collection('books').doc(bookId);
  const bookSnap = await bookRef.get();

  if (!bookSnap.exists) {
    return { deleted: false, sellerId: null as string | null, title: null as string | null };
  }

  const book = bookSnap.data() as Pick<Book, 'sellerId' | 'title'>;

  await deleteQueryDocuments(adminDb, bookRef.collection('chapters'));
  await deleteQueryDocuments(adminDb, adminDb.collection('library').where('bookId', '==', bookId));
  await deleteQueryDocuments(adminDb, adminDb.collection('wishlist').where('bookId', '==', bookId));
  await deleteQueryDocuments(
    adminDb,
    adminDb.collection('readingProgress').where('bookId', '==', bookId)
  );
  await deleteQueryDocuments(
    adminDb,
    adminDb.collection('borrowRecords').where('bookId', '==', bookId)
  );
  await deleteQueryDocuments(
    adminDb,
    adminDb.collection('notifications').where('relatedBookId', '==', bookId)
  );
  await deleteQueryDocuments(
    adminDb,
    adminDb.collection('promoCodes').where('specificBookId', '==', bookId)
  );
  await deleteReportsForTargets(adminDb, [bookId], 'book');

  const reviewsSnap = await adminDb.collection('reviews').where('bookId', '==', bookId).get();
  const reviewIds = reviewsSnap.docs.map((doc) => doc.id);
  await deleteDocumentRefs(adminDb, reviewsSnap.docs.map((doc) => doc.ref));
  await deleteReportsForTargets(adminDb, reviewIds, 'review');

  await bookRef.delete();

  if (!options?.skipSellerVerificationSync) {
    await syncSellerVerificationStatus(adminDb, book.sellerId);
  }

  return { deleted: true, sellerId: book.sellerId, title: book.title };
}

export async function deleteUserRecords(adminDb: Firestore, adminAuth: Auth, uid: string) {
  const userRef = adminDb.collection('users').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    return { deleted: false, deletedBookCount: 0 };
  }

  const user = userSnap.data() as Pick<User, 'role'>;
  const isSeller = user.role === 'seller' || user.role === 'both';
  let deletedBookCount = 0;

  if (isSeller) {
    const sellerBooks = await adminDb.collection('books').where('sellerId', '==', uid).get();

    for (const bookDoc of sellerBooks.docs) {
      const result = await deleteBookRecords(adminDb, bookDoc.id, {
        skipSellerVerificationSync: true,
      });
      if (result.deleted) {
        deletedBookCount += 1;
      }
    }
  }

  const userReviews = await adminDb.collection('reviews').where('reviewerId', '==', uid).get();
  const affectedBookIds = userReviews.docs
    .map((doc) => doc.data().bookId as string | undefined)
    .filter((bookId): bookId is string => !!bookId);
  const userReviewIds = userReviews.docs.map((doc) => doc.id);

  await deleteDocumentRefs(adminDb, userReviews.docs.map((doc) => doc.ref));
  await deleteReportsForTargets(adminDb, userReviewIds, 'review');

  for (const bookId of Array.from(new Set(affectedBookIds))) {
    await recalculateBookReviewStats(adminDb, bookId);
  }

  await deleteQueryDocuments(adminDb, adminDb.collection('library').where('userId', '==', uid));
  await deleteQueryDocuments(adminDb, adminDb.collection('wishlist').where('userId', '==', uid));
  await deleteQueryDocuments(
    adminDb,
    adminDb.collection('readingProgress').where('userId', '==', uid)
  );
  await deleteQueryDocuments(
    adminDb,
    adminDb.collection('borrowRecords').where('userId', '==', uid)
  );
  await deleteQueryDocuments(
    adminDb,
    adminDb.collection('notifications').where('userId', '==', uid)
  );
  await deleteQueryDocuments(
    adminDb,
    adminDb.collection('subscriptions').where('userId', '==', uid)
  );
  await deleteQueryDocuments(
    adminDb,
    adminDb.collection('reports').where('reporterId', '==', uid)
  );
  await deleteReportsForTargets(adminDb, [uid], 'user');
  await deleteQueryDocuments(
    adminDb,
    adminDb.collection('follows').where('followerId', '==', uid)
  );
  await deleteQueryDocuments(adminDb, adminDb.collection('follows').where('sellerId', '==', uid));

  if (isSeller) {
    await deleteQueryDocuments(
      adminDb,
      adminDb.collection('verificationRequests').where('sellerId', '==', uid)
    );
    await deleteQueryDocuments(
      adminDb,
      adminDb.collection('promoCodes').where('sellerId', '==', uid)
    );
    await adminDb.collection('sellers').doc(uid).delete().catch(() => undefined);
  }

  await userRef.delete();

  try {
    await adminAuth.deleteUser(uid);
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : '';

    if (!code.includes('user-not-found')) {
      throw error;
    }
  }

  return { deleted: true, deletedBookCount };
}
