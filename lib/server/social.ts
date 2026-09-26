import type { Firestore } from 'firebase-admin/firestore';

export async function updateFollow(db: Firestore, userId: string, sellerId: string, following: boolean) {
  const followRef = db.collection('follows').doc(`${userId}_${sellerId}`);
  const sellerRef = db.collection('sellers').doc(sellerId);
  await db.runTransaction(async (tx) => {
    const [follow, seller] = await Promise.all([tx.get(followRef), tx.get(sellerRef)]);
    if (!seller.exists) throw new Error('Author not found');
    if (follow.exists === following) return;
    if (following) tx.create(followRef, { followerId: userId, sellerId, createdAt: new Date() });
    else tx.delete(followRef);
    tx.update(sellerRef, { followersCount: Math.max(0, (seller.data()?.followersCount ?? 0) + (following ? 1 : -1)) });
  });
}

export async function createPurchaseReview(db: Firestore, userId: string, { bookId, ...content }: { bookId: string; title: string; body: string; stars: number }) {
  const ref = db.collection('reviews').doc(`${userId}_${bookId}`);
  await db.runTransaction(async (tx) => {
    const [book, profile, library, previous, legacy] = await Promise.all([
      tx.get(db.collection('books').doc(bookId)), tx.get(db.collection('users').doc(userId)),
      tx.get(db.collection('library').doc(`${userId}_${bookId}`)), tx.get(ref),
      tx.get(db.collection('reviews').where('bookId', '==', bookId).where('reviewerId', '==', userId).limit(1)),
    ]);
    if (!book.exists || book.data()?.status !== 'live' || book.data()?.sellerId === userId) throw new Error('This book cannot be reviewed');
    if (!library.exists || library.data()?.purchaseType !== 'bought') throw new Error('Purchase this book before reviewing it');
    if (previous.exists || !legacy.empty) throw new Error('You have already reviewed this book');
    const person = profile.data()!;
    const count = book.data()?.reviewCount ?? 0;
    const average = book.data()?.averageRating ?? 0;
    tx.create(ref, {
      bookId, ...content, reviewerId: userId,
      reviewerName: `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim(),
      reviewerInitials: `${person.firstName?.[0] ?? ''}${person.lastName?.[0] ?? ''}`.toUpperCase(),
      reviewerAvatarUrl: person.avatarUrl ?? null, isVerifiedPurchase: true,
      helpfulCount: 0, isReported: false, reportReason: null, sellerReply: null,
      status: 'active', createdAt: new Date(), updatedAt: new Date(),
    });
    tx.update(book.ref, { reviewCount: count + 1, averageRating: (average * count + content.stars) / (count + 1), updatedAt: new Date() });
  });
  return ref.id;
}
