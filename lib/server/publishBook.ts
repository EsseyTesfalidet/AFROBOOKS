import type { Firestore } from 'firebase-admin/firestore';
import { validateBookContent, BookContentError } from './bookContent';
import { requiresManualCopyrightReview } from '@/lib/utils/copyright';
import { countsTowardSellerVerificationBookLimit, requiresSellerIdVerificationForPublishing } from '@/lib/sellerVerification';

export async function publishBook(db: Firestore, bookId: string, sellerId: string) {
  return db.runTransaction(async (tx) => {
    const ref = db.collection('books').doc(bookId);
    const [snapshot, chapters, settings, seller, sellerBooks, deletion] = await Promise.all([
      tx.get(ref), tx.get(ref.collection('chapters')),
      tx.get(db.doc('platformSettings/global')), tx.get(db.doc(`sellers/${sellerId}`)),
      tx.get(db.collection('books').where('sellerId', '==', sellerId)),
      tx.get(db.collection('bookDeletions').doc(bookId)),
    ]);
    const book = snapshot.data();
    if (!book || deletion.exists || book.sellerId !== sellerId) throw new BookContentError('Book not found in your listings.');
    if (book.status !== 'draft') throw new BookContentError('Only a draft can be submitted for publication.');
    if (book.isPreorder) throw new BookContentError('New preorders are unavailable. Publish the completed book or save a draft.');
    if (book.inSubscription) throw new BookContentError('New subscription listings are unavailable. Choose individual sales.');
    validateBookContent(book, chapters.docs);
    if (!Number.isSafeInteger(book.price) || book.price < 50 || book.price > 99999999) throw new BookContentError('Set a valid price of at least $0.50.');
    if (!book.title?.trim() || !book.authorName?.trim() || !book.genre?.trim() || book.copyrightAttestationAccepted !== true) {
      throw new BookContentError('Complete the book details and publishing rights confirmation.');
    }
    const manualReview = requiresManualCopyrightReview(book.copyrightBasis);
    if (manualReview && !book.copyrightDetails?.trim()) throw new BookContentError('Add the copyright or licensing details.');
    const publishedCount = sellerBooks.docs.filter((item) => item.id !== bookId && countsTowardSellerVerificationBookLimit(item.data() as Parameters<typeof countsTowardSellerVerificationBookLimit>[0])).length;
    if (requiresSellerIdVerificationForPublishing(publishedCount, seller.data()?.verificationStatus?.idVerified === true)) {
      throw new BookContentError('Complete ID verification before publishing another book.');
    }
    const status = settings.data()?.autoApproveBooks === true && !manualReview ? 'live' : 'in_review';
    tx.update(ref, {
      status, publishedAt: new Date(), updatedAt: new Date(),
      copyrightReviewStatus: status === 'live' ? 'approved' : 'pending',
    });
    return status;
  });
}
