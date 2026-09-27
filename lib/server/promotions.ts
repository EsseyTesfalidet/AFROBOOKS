import { createHash } from 'node:crypto';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { Promotion, PromotionSettings } from '../../types/promotion';
import { promotionIsOpen, promotionSettings, PROMOTION_TERMS_VERSION } from '../promotions';

export class PromotionError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export interface PromotionActor {
  uid: string;
  role: string;
}
export function promotionId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new PromotionError('Invalid promotion or book.', 400);
}
export function requireAuthor(actor: PromotionActor) {
  if (!['seller', 'both', 'admin'].includes(actor.role))
    throw new PromotionError('An author account is required.', 403);
}
export function requirePromotionAdmin(actor: PromotionActor) {
  if (actor.role !== 'admin') throw new PromotionError('Administrator access is required.', 403);
}
export function creativeHash(book: Record<string, unknown>) {
  return createHash('sha256')
    .update(JSON.stringify([book.title, book.authorName, book.coverUrl, book.genre]))
    .digest('hex');
}
export async function eligiblePromotionBook(
  db: Firestore,
  tx: Transaction | null,
  bookId: string,
  sellerId: string,
  hash?: string,
) {
  const refs = [
    db.doc(`books/${bookId}`),
    db.doc(`bookDeletions/${bookId}`),
    db.doc(`users/${sellerId}`),
  ];
  const snapshots = await Promise.all(refs.map((ref) => (tx ? tx.get(ref) : ref.get())));
  const book = snapshots[0].data();
  const owner = snapshots[2].data();
  return book &&
    !snapshots[1].exists &&
    owner &&
    !['suspended', 'banned'].includes(owner.status) &&
    book.status === 'live' &&
    !book.deletionPending &&
    book.sellerId === sellerId &&
    typeof book.coverUrl === 'string' &&
    book.coverUrl.trim() &&
    (!hash || creativeHash(book) === hash)
    ? book
    : null;
}
export async function submitPromotion(
  db: Firestore,
  actor: PromotionActor,
  bookId: string,
  expectedPrice: number,
  termsVersion: string,
  now = Date.now(),
) {
  requireAuthor(actor);
  promotionId(bookId);
  if (termsVersion !== PROMOTION_TERMS_VERSION)
    throw new PromotionError('Please review the current promotion terms.', 400);
  const campaignRef = db.collection('bookPromotions').doc();
  return db.runTransaction(async (tx) => {
    const settings = promotionSettings((await tx.get(db.doc('promotionSettings/global'))).data());
    if (!settings.enabled) throw new PromotionError('New promotions are temporarily closed.');
    if (expectedPrice !== settings.priceCents)
      throw new PromotionError(
        'The offer changed. Refresh and review the new price before submitting.',
      );
    const book = await eligiblePromotionBook(db, tx, bookId, actor.uid);
    if (!book) throw new PromotionError('Choose your own published book with a cover image.');
    const slotRef = db.doc(`promotionSlots/${bookId}`);
    const slot = (await tx.get(slotRef)).data();
    if (slot?.campaignId) {
      const previous = (await tx.get(db.doc(`bookPromotions/${slot.campaignId}`))).data() as
        | Promotion
        | undefined;
      if (previous && promotionIsOpen(previous, now))
        throw new PromotionError('This book already has an open promotion.');
    }
    const campaign: Promotion = {
      id: campaignRef.id,
      sellerId: actor.uid,
      bookId,
      status: 'pending',
      priceCents: settings.priceCents,
      currency: 'usd',
      durationDays: 7,
      createdAt: now,
      startsAt: 0,
      endsAt: 0,
      servingUntil: 0,
      views: 0,
      clicks: 0,
      note: '',
      paidAt: 0,
      creativeHash: creativeHash(book),
    };
    tx.create(campaignRef, { ...campaign, termsVersion, termsAcceptedAt: now, updatedAt: now });
    tx.set(slotRef, { campaignId: campaignRef.id });
    return campaignRef.id;
  });
}
export async function reviewPromotion(
  db: Firestore,
  actor: PromotionActor,
  id: string,
  action: 'approve' | 'reject' | 'stop',
  note: string,
  now = Date.now(),
) {
  promotionId(id);
  if (action !== 'stop') requirePromotionAdmin(actor);
  const ref = db.doc(`bookPromotions/${id}`);
  await db.runTransaction(async (tx) => {
    const item = (await tx.get(ref)).data() as Promotion | undefined;
    if (!item) throw new PromotionError('Promotion not found.', 404);
    if (actor.role !== 'admin' && item.sellerId !== actor.uid)
      throw new PromotionError('This promotion belongs to another author.', 403);
    if (action === 'approve') {
      if (item.status !== 'pending')
        throw new PromotionError('This promotion was already reviewed.');
      const book = await eligiblePromotionBook(
        db,
        tx,
        item.bookId,
        item.sellerId,
        item.creativeHash,
      );
      if (!book)
        throw new PromotionError(
          'The book changed or is unavailable. Reject this request and ask the author to resubmit.',
        );
      const settings = promotionSettings((await tx.get(db.doc('promotionSettings/global'))).data());
      if (!settings.enabled) throw new PromotionError('New promotions are temporarily closed.');
      const free = item.priceCents === 0;
      const endsAt = free ? now + 7 * 86400000 : 0;
      tx.update(ref, {
        status: free ? 'active' : 'approved',
        startsAt: free ? now : 0,
        endsAt,
        servingUntil: endsAt,
        reviewedBy: actor.uid,
        reviewedAt: now,
        note: note.slice(0, 500),
        updatedAt: now,
      });
    } else {
      if (action === 'reject' && item.status !== 'pending')
        throw new PromotionError('Only pending promotions can be rejected.');
      if (action === 'reject' && !note.trim())
        throw new PromotionError('Add a short reason for the author.', 400);
      if (['refunded', 'rejected', 'stopped'].includes(item.status)) return;
      // A checkout in flight may still complete. Keep it visible for payment reconciliation.
      const financialReview = item.paidAt > 0 || !!item.checkoutAttemptAt;
      tx.update(ref, {
        status: action === 'reject' ? 'rejected' : financialReview ? 'needs_review' : 'stopped',
        servingUntil: 0,
        note: note.trim().slice(0, 500) || 'Stopped by the author.',
        stoppedAt: now,
        updatedAt: now,
      });
    }
    tx.create(db.collection('promotionAudit').doc(), {
      campaignId: id,
      actorId: actor.uid,
      action,
      at: now,
    });
  });
}
export async function savePromotionSettings(
  db: Firestore,
  actor: PromotionActor,
  settings: PromotionSettings,
) {
  requirePromotionAdmin(actor);
  const normalized = promotionSettings(settings as unknown as Record<string, unknown>);
  if (normalized.priceCents !== settings.priceCents || normalized.enabled !== settings.enabled)
    throw new PromotionError('Use $0 for the pilot, or a price from $1 to $1,000.', 400);
  const batch = db.batch();
  batch.set(db.doc('promotionSettings/global'), {
    ...normalized,
    updatedAt: Date.now(),
    updatedBy: actor.uid,
  });
  batch.create(db.collection('promotionAudit').doc(), {
    actorId: actor.uid,
    action: 'settings',
    ...normalized,
    at: Date.now(),
  });
  await batch.commit();
}
export async function stopBookPromotions(
  db: Firestore,
  bookId: string,
  reason = 'The book is no longer available.',
) {
  const campaigns = await db.collection('bookPromotions').where('bookId', '==', bookId).get();
  await Promise.all(
    campaigns.docs.map((doc) =>
      db.runTransaction(async (tx) => {
        const item = (await tx.get(doc.ref)).data() as Promotion;
        if (!['pending', 'approved', 'active'].includes(item.status)) return;
        tx.update(doc.ref, {
          status: item.paidAt || item.checkoutAttemptAt ? 'needs_review' : 'stopped',
          servingUntil: 0,
          note: reason,
          updatedAt: Date.now(),
        });
      }),
    ),
  );
}
export async function promotionCandidates(db: Firestore, now = Date.now()) {
  const snapshots = await db.collection('bookPromotions').where('servingUntil', '>', now).get();
  const candidates = await Promise.all(
    snapshots.docs.map(async (doc) => {
      const item = doc.data() as Promotion;
      if (item.status !== 'active' || item.startsAt > now || item.endsAt <= now) return null;
      const book = await eligiblePromotionBook(
        db,
        null,
        item.bookId,
        item.sellerId,
        item.creativeHash,
      );
      return book ? { id: doc.id, bookId: item.bookId, endsAt: item.endsAt } : null;
    }),
  );
  return candidates.filter((item): item is NonNullable<typeof item> => !!item);
}
export async function recordPromotionEvent(
  db: Firestore,
  uid: string,
  id: string,
  kind: 'view' | 'click',
  now = Date.now(),
) {
  promotionId(id);
  const day = new Date(now).toISOString().slice(0, 10);
  const key = createHash('sha256').update(`${id}:${day}:${uid}`).digest('hex');
  const ref = db.doc(`bookPromotions/${id}`);
  // Signed-in reader counts, deduplicated per account/day. No IPs or advertising cookies.
  const eventRef = ref.collection('dailyReaders').doc(key);
  await db.runTransaction(async (tx) => {
    const [snapshot, previous] = await Promise.all([tx.get(ref), tx.get(eventRef)]);
    const item = snapshot.data() as Promotion | undefined;
    if (
      !item ||
      item.sellerId === uid ||
      item.status !== 'active' ||
      item.startsAt > now ||
      item.servingUntil <= now ||
      item.endsAt <= now
    )
      return;
    if (!(await eligiblePromotionBook(db, tx, item.bookId, item.sellerId, item.creativeHash)))
      return;
    const data = previous.data();
    if (data?.[kind]) return;
    // A click also proves the placement was seen. A fast click must not produce a CTR > 100%.
    tx.set(
      eventRef,
      { [kind]: true, ...(kind === 'click' ? { view: true } : {}), day },
      { merge: true },
    );
    tx.update(ref, {
      [kind === 'view' ? 'views' : 'clicks']: FieldValue.increment(1),
      ...(kind === 'click' && !data?.view ? { views: FieldValue.increment(1) } : {}),
    });
  });
}
