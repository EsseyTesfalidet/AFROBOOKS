import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { agreementRequiredResponse } from '@/lib/server/legalAgreement';
import { getStripeServer } from '@/lib/stripe/server';
import { claimBookGift, findBookGift, giftPreview, GiftError, reviewGiftPayment } from '@/lib/server/bookGifts';
import { deliverBookGift, giftClaimUrl, giftEmailConfiguration } from '@/lib/server/giftEmail';
import { giftTokenSchema } from '@/lib/gifts';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('resume'), giftId: giftTokenSchema }),
  z.object({ action: z.literal('preview'), token: giftTokenSchema }),
  z.object({ action: z.literal('claim'), token: giftTokenSchema }),
  z.object({ action: z.literal('link'), giftId: giftTokenSchema }),
  z.object({ action: z.literal('retry_email'), giftId: giftTokenSchema }),
]);

function failure(error: unknown) {
  if (error instanceof GiftError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });
  return NextResponse.json({ error: 'Unable to update this gift. Please try again.' }, { status: 503 });
}

// POST also keeps private gift history out of the PWA's generic GET cache.
export async function POST(req: NextRequest) {
  try {
    const user = await requireRequestUser(req);
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid gift request.' }, { status: 400 });
    const input = parsed.data;
    const db = await getAdminDb();
    if (input.action === 'resume') {
      const gift = (await db.collection('bookGifts').doc(input.giftId).get()).data();
      if (!gift || gift.senderId !== user.uid) throw new GiftError('Gift not found.', 'NOT_FOUND', 404);
      return NextResponse.json({ gift: { bookId: gift.bookId, price: gift.price, attemptId: gift.attemptId, recipientEmail: gift.recipientEmail, message: gift.message } }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (input.action === 'list') {
      const gifts = await db.collection('bookGifts').where('senderId', '==', user.uid).orderBy('createdAt', 'desc').limit(100).get();
      return NextResponse.json({ gifts: gifts.docs.map(doc => {
        const gift = doc.data();
        return { id: doc.id, bookId: gift.bookId, bookTitle: gift.bookTitle, recipientEmail: gift.recipientEmail,
          message: gift.message, price: gift.price, status: gift.status, emailStatus: gift.emailStatus,
          createdAt: gift.createdAt.toMillis(), claimedAt: gift.claimedAt?.toMillis() ?? null, orderId: gift.orderId };
      }) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (input.action === 'link' || input.action === 'retry_email') {
      const snapshot = await db.collection('bookGifts').doc(input.giftId).get();
      const gift = snapshot.data();
      if (!gift || gift.senderId !== user.uid) throw new GiftError('Gift not found.', 'NOT_FOUND', 404);
      if (gift.status !== 'available') throw new GiftError('This gift is not waiting to be claimed.');
      const config = giftEmailConfiguration();
      if (!config) throw new Error('Gift email configuration missing');
      if (input.action === 'retry_email') {
        await deliverBookGift(db, snapshot.id);
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ url: giftClaimUrl(config.appUrl, gift.claimToken) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    // Auth's verified identity, never an editable Firestore profile email.
    const identity = await (await getAdminAuth()).getUser(user.uid);
    if (identity.disabled) throw new Error('Unauthorized');
    const recipient = { uid: user.uid, email: identity.email, emailVerified: identity.emailVerified };
    const snapshot = await findBookGift(db, input.token);
    const gift = snapshot.data();
    const preview = giftPreview(gift, recipient);
    if (input.action === 'preview') return NextResponse.json(preview, { headers: { 'Cache-Control': 'no-store' } });
    const agreementError = agreementRequiredResponse(user);
    if (agreementError) return agreementError;
    const payment = await getStripeServer().paymentIntents.retrieve(gift.paymentIntentId, { expand: ['latest_charge'] });
    const charge = payment.latest_charge as Stripe.Charge | null;
    if (!charge || typeof charge === 'string') throw new GiftError('The gift payment is not confirmed yet.');
    if (charge.amount_refunded > 0 || charge.disputed) await reviewGiftPayment(db, payment.id);
    const result = await claimBookGift(db, snapshot.ref, recipient, { ...payment, refunded: charge.amount_refunded > 0, disputed: charge.disputed });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
