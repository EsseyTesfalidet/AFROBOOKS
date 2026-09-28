import { createHash, randomBytes } from 'node:crypto';
import type { Firestore, DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { giftTokenSchema, type GiftPreview } from '../gifts';
import { validateBookContent } from './bookContent';

export class GiftError extends Error {
  constructor(message: string, public code = 'GIFT_UNAVAILABLE', public status = 409) { super(message); }
}

export function giftTokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function giftAttemptId(senderId: string, attemptId: string) { return giftTokenHash(`${senderId}:${attemptId}`); }

export interface GiftRecipient { uid: string; email?: string; emailVerified: boolean }
export function checkGiftRecipient(gift: DocumentData, recipient: GiftRecipient) {
  if (!recipient.email || gift.recipientEmail !== recipient.email.trim().toLowerCase()) {
    throw new GiftError('Sign in with the email address this gift was sent to.', 'WRONG_RECIPIENT', 403);
  }
  if (!recipient.emailVerified) throw new GiftError('Verify your email address before opening this gift.', 'VERIFY_EMAIL', 403);
}

// Save the order before contacting Stripe. A lost response can safely retry the
// same payment and cannot create a second gift or charge.
export async function prepareBookGift(db: Firestore, input: {
  senderId: string; senderName: string; recipientEmail: string; message: string;
  attemptId: string; order: DocumentData;
}) {
  const id = giftAttemptId(input.senderId, input.attemptId);
  const ref = db.collection('bookGifts').doc(id);
  const orderId = `gift_${id}`;
  return db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      const gift = existing.data()!;
      if (gift.bookId !== input.order.bookId || gift.recipientEmail !== input.recipientEmail || gift.message !== input.message || gift.price !== input.order.finalPrice) {
        throw new GiftError('The gift details or book price changed. Check My gifts or contact support before starting a new checkout.');
      }
      if (gift.status === 'needs_review') throw new GiftError('This gift needs review. Please check My gifts before paying again.');
      if (!gift.paymentIntentId && Date.now() - gift.createdAt.toMillis() > 23 * 60 * 60 * 1000) {
        throw new GiftError('This checkout has expired. Check My gifts or contact support before paying again.');
      }
      return { id, orderId, paymentIntentId: gift.paymentIntentId as string | null };
    }
    const token = randomBytes(32).toString('hex');
    tx.create(ref, {
      senderId: input.senderId, senderName: input.senderName, recipientEmail: input.recipientEmail, attemptId: input.attemptId,
      message: input.message, bookId: input.order.bookId, bookTitle: input.order.bookTitle,
      price: input.order.finalPrice, orderId, paymentIntentId: null, status: 'pending',
      claimToken: token, claimTokenHash: giftTokenHash(token), createdAt: new Date(), emailStatus: 'pending',
    });
    tx.create(db.collection('orders').doc(orderId), { ...input.order, giftId: id, stripePaymentIntentId: null, createdAt: new Date() });
    return { id, orderId, paymentIntentId: null };
  });
}

export async function attachGiftPayment(db: Firestore, giftId: string, paymentId: string) {
  const ref = db.collection('bookGifts').doc(giftId);
  await db.runTransaction(async tx => {
    const gift = (await tx.get(ref)).data();
    if (!gift || (gift.paymentIntentId && gift.paymentIntentId !== paymentId)) throw new Error('Gift payment mismatch');
    tx.update(ref, { paymentIntentId: paymentId });
    tx.update(db.collection('orders').doc(gift.orderId), { stripePaymentIntentId: paymentId });
  });
}

export async function findBookGift(db: Firestore, token: string) {
  if (!giftTokenSchema.safeParse(token).success) throw new GiftError('This gift link is invalid.', 'INVALID_LINK', 404);
  const gifts = await db.collection('bookGifts').where('claimTokenHash', '==', giftTokenHash(token)).limit(1).get();
  if (gifts.empty) throw new GiftError('This gift link is invalid.', 'INVALID_LINK', 404);
  return gifts.docs[0];
}

export function giftPreview(gift: DocumentData, recipient: GiftRecipient): GiftPreview {
  checkGiftRecipient(gift, recipient);
  if (!['available', 'claimed'].includes(gift.status) || (gift.status === 'claimed' && gift.recipientId !== recipient.uid)) {
    throw new GiftError('This gift is not available to claim. Ask the sender to check My gifts.');
  }
  return { bookId: gift.bookId, bookTitle: gift.bookTitle, senderName: gift.senderName, message: gift.message, claimed: gift.status === 'claimed' };
}

export interface GiftPaymentState { id: string; status: string; amount_received: number; currency: string; refunded: boolean; disputed: boolean }

export async function claimBookGift(db: Firestore, ref: DocumentReference, recipient: GiftRecipient, payment: GiftPaymentState) {
  return db.runTransaction(async tx => {
    const gift = (await tx.get(ref)).data();
    if (!gift) throw new GiftError('This gift link is invalid.');
    const preview = giftPreview(gift, recipient);
    if (payment.id !== gift.paymentIntentId || payment.status !== 'succeeded' || payment.amount_received !== gift.price || payment.currency !== 'usd' || payment.refunded || payment.disputed) {
      throw new GiftError('The payment for this gift needs review. Ask the sender to contact support.');
    }
    const bookRef = db.collection('books').doc(gift.bookId);
    const libraryRef = db.collection('library').doc(`${recipient.uid}_${gift.bookId}`);
    const [book, deletion, library, order, user, chapters] = await Promise.all([
      tx.get(bookRef), tx.get(db.collection('bookDeletions').doc(gift.bookId)), tx.get(libraryRef),
      tx.get(db.collection('orders').doc(gift.orderId)), tx.get(db.collection('users').doc(recipient.uid)),
      tx.get(bookRef.collection('chapters')),
    ]);
    if (!user.exists || !['active', 'warned'].includes(user.data()?.status)) throw new GiftError('Your account cannot claim this gift.', 'ACCOUNT_UNAVAILABLE', 403);
    if (order.data()?.status !== 'completed' || order.data()?.giftId !== ref.id || order.data()?.stripePaymentIntentId !== payment.id) throw new GiftError('This gift payment has not been confirmed.');
    const data = book.data();
    if (!data || data.status !== 'live' || data.deletionPending || deletion.exists || (data.isPreorder && (data.releaseDate?.toMillis() ?? Infinity) > Date.now())) {
      throw new GiftError('This book is currently unavailable. Ask the sender to contact support.');
    }
    try { validateBookContent(data, chapters.docs); } catch { throw new GiftError('This book is currently unavailable. Ask the sender to contact support.'); }
    if (preview.claimed) return preview;
    if (['bought', 'free_copy'].includes(library.data()?.purchaseType)) {
      throw new GiftError('You already own this book. The gift remains unclaimed; ask the sender to contact support.', 'ALREADY_OWNED');
    }
    tx.set(libraryRef, { id: libraryRef.id, userId: recipient.uid, bookId: gift.bookId, purchaseType: 'bought', orderId: gift.orderId, giftId: ref.id, addedAt: new Date() });
    tx.update(ref, { status: 'claimed', recipientId: recipient.uid, claimedAt: new Date() });
    tx.set(db.collection('notifications').doc(`${ref.id}_claimed_sender`), {
      userId: gift.senderId, type: 'system', title: 'Your gift was claimed', message: `Your gift of "${gift.bookTitle}" has been claimed.`,
      actionUrl: '/gifts', relatedBookId: gift.bookId, isRead: false, createdAt: new Date(),
    });
    tx.set(db.collection('notifications').doc(`${ref.id}_claimed_recipient`), {
      userId: recipient.uid, type: 'purchase', title: 'A gift for your library', message: `"${gift.bookTitle}" is ready to read.`,
      actionUrl: `/read/${gift.bookId}`, relatedBookId: gift.bookId, isRead: false, createdAt: new Date(),
    });
    return { ...preview, claimed: true };
  });
}

// Refunds and disputes block unclaimed gifts and remove only the entitlement
// supplied by this gift. A later independent purchase is preserved.
export async function reviewGiftPayment(db: Firestore, paymentId: string) {
  const gifts = await db.collection('bookGifts').where('paymentIntentId', '==', paymentId).get();
  for (const snapshot of gifts.docs) await db.runTransaction(async tx => {
    const gift = (await tx.get(snapshot.ref)).data()!;
    const libraryRef = gift.recipientId ? db.collection('library').doc(`${gift.recipientId}_${gift.bookId}`) : null;
    const library = libraryRef ? await tx.get(libraryRef) : null;
    tx.update(snapshot.ref, { status: 'needs_review', reviewReason: 'payment_review', reviewedAt: new Date() });
    if (libraryRef && library?.data()?.orderId === gift.orderId) tx.delete(libraryRef);
  });
}
