import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { paymentConfiguration } from '@/lib/stripe/config';
import { getStripeServer } from '@/lib/stripe/server';
import { promotionSettings } from '@/lib/promotions';
import {
  PromotionError,
  promotionId,
  requireAuthor,
  requirePromotionAdmin,
  reviewPromotion,
  savePromotionSettings,
  submitPromotion,
  eligiblePromotionBook,
} from '@/lib/server/promotions';
import { createPromotionCheckout, resolvePromotionPayment } from '@/lib/server/promotionPayments';
import type { Promotion, PromotionBook } from '@/types/promotion';

const headers = { 'Cache-Control': 'no-store' };
function failure(error: unknown) {
  if (error instanceof PromotionError)
    return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (
    error instanceof Error &&
    (error.message === 'Unauthorized' || (error as { code?: string }).code?.startsWith('auth/'))
  )
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers });
  console.error('Promotion request failed', {
    code: (error as { code?: string })?.code ?? 'unavailable',
  });
  return NextResponse.json(
    { error: 'Promotions are temporarily unavailable. Please try again.' },
    { status: 503, headers },
  );
}
export async function GET(req: NextRequest) {
  try {
    const user = await requireRequestUser(req);
    requireAuthor(user);
    const admin = req.nextUrl.searchParams.get('scope') === 'admin';
    if (admin) requirePromotionAdmin(user);
    const db = await getAdminDb();
    let query = db.collection('bookPromotions').orderBy('createdAt', 'desc').limit(26);
    if (!admin) query = query.where('sellerId', '==', user.uid);
    const cursor = req.nextUrl.searchParams.get('cursor');
    if (cursor) {
      promotionId(cursor);
      const snapshot = await db.doc(`bookPromotions/${cursor}`).get();
      if (!snapshot.exists || (!admin && snapshot.data()?.sellerId !== user.uid))
        throw new PromotionError('Invalid page.', 400);
      query = query.startAfter(snapshot);
    }
    const [snapshot, settingsDoc] = await Promise.all([
      query.get(),
      db.doc('promotionSettings/global').get(),
    ]);
    const campaigns = snapshot.docs
      .slice(0, 25)
      .map((doc) => ({ ...doc.data(), id: doc.id }) as Promotion);
    await Promise.all(
      campaigns.map(async (item) => {
        if (
          (item.status === 'approved' || (item.status === 'active' && item.endsAt > Date.now())) &&
          !(await eligiblePromotionBook(db, null, item.bookId, item.sellerId, item.creativeHash))
        )
          item.deliveryIssue =
            'This book changed or is unavailable, so the campaign is not showing. Stop it and submit a new request, or contact support for payment review.';
      }),
    );
    const bookIds = [...new Set(campaigns.map((item) => item.bookId))];
    const owned = admin
      ? []
      : (await db.collection('books').where('sellerId', '==', user.uid).get()).docs;
    const historical = bookIds.length
      ? await db.getAll(...bookIds.map((id) => db.doc(`books/${id}`)))
      : [];
    const books = new Map<string, PromotionBook>();
    for (const doc of [...owned, ...historical]) {
      const book = doc.data();
      if (book && (admin || book.sellerId === user.uid) && book.status !== 'removed')
        books.set(doc.id, {
          id: doc.id,
          title: book.title ?? 'Untitled book',
          authorName: book.authorName ?? '',
          coverUrl: book.coverUrl ?? '',
          coverBgColor: book.coverBgColor ?? '',
          coverAccentColor: book.coverAccentColor ?? '',
          status: book.status,
        });
    }
    return NextResponse.json(
      {
        campaigns,
        books: [...books.values()],
        settings: promotionSettings(settingsDoc.data()),
        paymentsReady: paymentConfiguration(process.env).checkoutReady,
        hasMore: snapshot.size > 25,
        nextCursor: snapshot.size > 25 ? campaigns.at(-1)?.id : null,
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit'),
    bookId: id,
    expectedPrice: z.number().int().nonnegative(),
    termsVersion: z.string().max(50),
  }),
  z.object({
    action: z.enum(['approve', 'reject', 'stop']),
    id,
    note: z.string().max(500).default(''),
  }),
  z.object({ action: z.enum(['checkout', 'resolve_payment']), id }),
  z.object({
    action: z.literal('settings'),
    enabled: z.boolean(),
    priceCents: z.number().int().min(0).max(100000),
  }),
]);
export async function POST(req: NextRequest) {
  try {
    const user = await requireRequestUser(req);
    requireAuthor(user);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Check the promotion details and try again.' },
        { status: 400, headers },
      );
    const input = parsed.data;
    const db = await getAdminDb();
    if (input.action === 'submit') {
      if (input.expectedPrice > 0 && !paymentConfiguration(process.env).checkoutReady)
        throw new PromotionError('Paid promotions are currently unavailable.');
      const id = await submitPromotion(
        db,
        user,
        input.bookId,
        input.expectedPrice,
        input.termsVersion,
      );
      return NextResponse.json({ id }, { headers });
    }
    if (input.action === 'settings') {
      requirePromotionAdmin(user);
      if (input.priceCents > 0 && !paymentConfiguration(process.env).checkoutReady)
        throw new PromotionError('Configure live Stripe payments before setting a paid offer.');
      await savePromotionSettings(db, user, {
        enabled: input.enabled,
        priceCents: input.priceCents,
        durationDays: 7,
      });
    } else if (input.action === 'checkout') {
      if (!paymentConfiguration(process.env).checkoutReady)
        throw new PromotionError('Paid promotions are currently unavailable.');
      const base = process.env.NEXT_PUBLIC_APP_URL;
      if (!base || new URL(base).protocol !== 'https:')
        throw new PromotionError('The checkout return address is not configured.');
      const url = await createPromotionCheckout(
        db,
        getStripeServer(),
        user,
        input.id,
        new URL(base).origin,
      );
      return NextResponse.json({ url }, { headers });
    } else if (input.action === 'resolve_payment') {
      requirePromotionAdmin(user);
      await resolvePromotionPayment(db, getStripeServer(), user, input.id);
    } else if ('note' in input) await reviewPromotion(db, user, input.id, input.action, input.note);
    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}
