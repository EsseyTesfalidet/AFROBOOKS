import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  writeBatch,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './config';
import type { Book } from '@/types/book';
import type { Order, LibraryItem, WishlistItem, ReadingProgress } from '@/types/order';
import type { Review, Notification, Report } from '@/types/review';
import type { PlatformSettings } from '@/types/subscription';
import { countsTowardSellerVerificationBookLimit } from '@/lib/sellerVerification';

// ── Books ──────────────────────────────────────────────────────────────────

export async function getLiveBooks(constraints: QueryConstraint[] = []): Promise<Book[]> {
  const q = query(
    collection(db, 'books'),
    where('status', '==', 'live'),
    ...constraints
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Book));
}

export async function getBook(bookId: string): Promise<Book | null> {
  const snap = await getDoc(doc(db, 'books', bookId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Book;
}

export async function getBooksByGenre(genre: string, max = 10): Promise<Book[]> {
  return getLiveBooks([where('genre', '==', genre), limit(max)]);
}

export async function getFeaturedBooks(max = 10): Promise<Book[]> {
  return getLiveBooks([where('isFeatured', '==', true), limit(max)]);
}

export async function getTrendingBooks(max = 10): Promise<Book[]> {
  return getLiveBooks([orderBy('totalSales', 'desc'), limit(max)]);
}

export async function getNewReleases(max = 10): Promise<Book[]> {
  return getLiveBooks([orderBy('publishedAt', 'desc'), limit(max)]);
}

export async function getSellerBooks(sellerId: string): Promise<Book[]> {
  const q = query(collection(db, 'books'), where('sellerId', '==', sellerId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Book));
}

export async function getSellerPublishedBooksCount(sellerId: string): Promise<number> {
  const books = await getSellerBooks(sellerId);
  return books.filter(countsTowardSellerVerificationBookLimit).length;
}

export async function getSimilarBooks(genre: string, excludeId: string, max = 6): Promise<Book[]> {
  return getLiveBooks([where('genre', '==', genre), limit(max + 1)]).then((books) =>
    books.filter((b) => b.id !== excludeId).slice(0, max)
  );
}

export async function getActiveReadingProgress(userId: string): Promise<ReadingProgress[]> {
  const q = query(
    collection(db, 'readingProgress'),
    where('userId', '==', userId),
    where('isFinished', '==', false),
    orderBy('lastReadAt', 'desc'),
    limit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ReadingProgress);
}

export async function getRecentlyFinishedReading(userId: string): Promise<ReadingProgress[]> {
  const q = query(
    collection(db, 'readingProgress'),
    where('userId', '==', userId),
    where('isFinished', '==', true),
    orderBy('finishedAt', 'desc'),
    limit(6)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ReadingProgress);
}

// ── Follows ────────────────────────────────────────────────────────────────

export async function getFollowedSellerIds(userId: string, max = 12): Promise<string[]> {
  const q = query(
    collection(db, 'follows'),
    where('followerId', '==', userId),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data().sellerId as string | undefined)
    .filter((sellerId): sellerId is string => !!sellerId);
}

export async function getBooksBySellerIds(sellerIds: string[], max = 12): Promise<Book[]> {
  const uniqueSellerIds = Array.from(new Set(sellerIds)).filter(Boolean);
  if (!uniqueSellerIds.length) return [];

  const batches: string[][] = [];
  for (let index = 0; index < uniqueSellerIds.length; index += 10) {
    batches.push(uniqueSellerIds.slice(index, index + 10));
  }

  const snaps = await Promise.all(
    batches.map((sellerBatch) =>
      getDocs(
        query(
          collection(db, 'books'),
          where('status', '==', 'live'),
          where('sellerId', 'in', sellerBatch)
        )
      )
    )
  );

  const books = snaps.flatMap((snap) =>
    snap.docs.map((d) => ({ id: d.id, ...d.data() } as Book))
  );

  return books
    .sort(
      (left, right) =>
        (right.publishedAt?.toMillis?.() ?? 0) - (left.publishedAt?.toMillis?.() ?? 0)
    )
    .slice(0, max);
}

export async function followAuthor(userId: string, sellerId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'follows', `${userId}_${sellerId}`), {
    followerId: userId,
    sellerId,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'sellers', sellerId), { followersCount: increment(1) });
  await batch.commit();
}

export async function unfollowAuthor(userId: string, sellerId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'follows', `${userId}_${sellerId}`));
  batch.update(doc(db, 'sellers', sellerId), { followersCount: increment(-1) });
  await batch.commit();
}

export async function isFollowingAuthor(userId: string, sellerId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'follows', `${userId}_${sellerId}`));
  return snap.exists();
}

// ── Chapters ───────────────────────────────────────────────────────────────

export async function getChapters(bookId: string) {
  const q = query(
    collection(db, 'books', bookId, 'chapters'),
    orderBy('chapterNumber', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getChapter(bookId: string, chapterId: string) {
  const snap = await getDoc(doc(db, 'books', bookId, 'chapters', chapterId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ── Library ────────────────────────────────────────────────────────────────

export async function getUserLibrary(userId: string): Promise<LibraryItem[]> {
  const q = query(collection(db, 'library'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryItem));
}

export async function isBookInLibrary(userId: string, bookId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'library', `${userId}_${bookId}`));
  return snap.exists();
}

export async function addToLibrary(
  userId: string,
  bookId: string,
  purchaseType: LibraryItem['purchaseType'],
  orderId: string | null
): Promise<void> {
  const item: Omit<LibraryItem, 'addedAt'> & { addedAt: ReturnType<typeof serverTimestamp> } = {
    id: `${userId}_${bookId}`,
    userId,
    bookId,
    purchaseType,
    orderId,
    addedAt: serverTimestamp() as unknown as import('firebase/firestore').Timestamp,
  };
  await setDoc(doc(db, 'library', `${userId}_${bookId}`), item, { merge: true });
}

// ── Wishlist ───────────────────────────────────────────────────────────────

export async function getUserWishlist(userId: string): Promise<WishlistItem[]> {
  const q = query(collection(db, 'wishlist'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WishlistItem));
}

export async function toggleWishlist(userId: string, bookId: string): Promise<void> {
  const ref = doc(db, 'wishlist', `${userId}_${bookId}`);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
  } else {
    await setDoc(ref, {
      id: `${userId}_${bookId}`,
      userId,
      bookId,
      addedAt: serverTimestamp(),
    });
  }
}

// ── Reviews ────────────────────────────────────────────────────────────────

export async function getBookReviews(bookId: string): Promise<Review[]> {
  const q = query(
    collection(db, 'reviews'),
    where('bookId', '==', bookId),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
}

export async function createReview(
  reviewData: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'reviews'), {
    ...reviewData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'books', reviewData.bookId), {
    reviewCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ── Reading Progress ───────────────────────────────────────────────────────

export async function getReadingProgress(
  userId: string,
  bookId: string
): Promise<ReadingProgress | null> {
  const snap = await getDoc(doc(db, 'readingProgress', `${userId}_${bookId}`));
  if (!snap.exists()) return null;
  return snap.data() as ReadingProgress;
}

export async function saveReadingProgress(
  userId: string,
  bookId: string,
  data: Partial<ReadingProgress>
): Promise<void> {
  const ref = doc(db, 'readingProgress', `${userId}_${bookId}`);
  await setDoc(
    ref,
    {
      id: `${userId}_${bookId}`,
      userId,
      bookId,
      currentChapter: 1,
      scrollPosition: 0,
      percentComplete: 0,
      isFinished: false,
      finishedAt: null,
      ...data,
      lastReadAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ── Orders ─────────────────────────────────────────────────────────────────

export async function getUserOrders(userId: string): Promise<Order[]> {
  const q = query(
    collection(db, 'orders'),
    where('buyerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
}

// ── Notifications ──────────────────────────────────────────────────────────

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void
) {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification)));
  });
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('isRead', '==', false)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
  await batch.commit();
}

// ── Platform Settings ──────────────────────────────────────────────────────

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const snap = await getDoc(doc(db, 'platformSettings', 'global'));
  if (!snap.exists()) {
    return {
      id: 'global',
      directSaleFee: 15,
      subscriptionPlatformCut: 30,
      borrowRatePerRead: 200,
      newBookExclusivityDays: 90,
      autoApproveBooks: true,
      newUserSignupsOpen: true,
      newSellerSignupsOpen: true,
      subscriptionSalesActive: true,
      maintenanceMode: false,
      subscriptionPrices: { basic: 499, standard: 999, premium: 1499 },
    };
  }
  return snap.data() as PlatformSettings;
}

export async function updatePlatformSettings(
  data: Partial<PlatformSettings>
): Promise<void> {
  await updateDoc(doc(db, 'platformSettings', 'global'), data as DocumentData);
}

// ── Reports ────────────────────────────────────────────────────────────────

export async function createReport(
  data: Omit<Report, 'id' | 'createdAt' | 'resolvedAt' | 'resolvedBy' | 'adminNote'>
): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    ...data,
    status: 'open',
    adminNote: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: serverTimestamp(),
  });
}

// ── Sample Chapters ────────────────────────────────────────────────────────

export async function getPreviewChapters(bookId: string) {
  const q = query(
    collection(db, 'books', bookId, 'chapters'),
    where('isPreview', '==', true),
    orderBy('chapterNumber', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
