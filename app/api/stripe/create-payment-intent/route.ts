import { NextRequest, NextResponse } from 'next/server';
import { getStripeServer, calculateFees } from '@/lib/stripe/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { z } from 'zod';
import { validateBookContent, BookContentError } from '@/lib/server/bookContent';
import { paymentConfiguration } from '@/lib/stripe/config';
import { calculateCartPricing, MAX_BOOK_PRICE_CENTS } from '@/lib/utils/fees';
import { syncAuthorAccount } from '@/lib/server/authorPayments';

const checkoutSchema = z.object({
  items: z.array(z.object({ bookId: z.string().min(1).max(128).regex(/^[^/]+$/) })).min(1).max(20),
  promoCode: z.string().max(100).nullable().optional(),
  promoBookId: z.string().max(128).nullable().optional(),
  discountAmount: z.number().finite().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const requestUser = await requireRequestUser(req);
    if (!paymentConfiguration(process.env).checkoutReady) return NextResponse.json({ error: 'Payments are temporarily unavailable. Please try again later.' }, { status: 503 });
    const parsed = checkoutSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid checkout' }, { status: 400 });
    const { items, promoCode, discountAmount = 0 } = parsed.data;

    if (!Array.isArray(items) || !items.length || items.length > 20 || items.some((item) => typeof item?.bookId !== 'string' || item.bookId.includes('/')) || new Set(items.map((item) => item.bookId)).size !== items.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (promoCode || discountAmount > 0) return NextResponse.json({ error: 'Promo codes are temporarily unavailable. Remove the code and review your total.' }, { status: 409 });
    const stripe = getStripeServer();
    const adminDb = await getAdminDb();

    const settings = (await adminDb.doc('platformSettings/global').get()).data();
    const directSaleFee = settings?.directSaleFee ?? 15;
    calculateFees(0, directSaleFee); // Validate configuration before creating a payment.
    const bookDetails: {
      bookId: string;
      title: string;
      sellerId: string;
      sellerName: string;
      authorName: string;
      originalPrice: number;
    }[] = [];

    for (const item of items) {
      const bookSnap = await adminDb.collection('books').doc(item.bookId).get();
      if (!bookSnap.exists) {
        return NextResponse.json({ error: `Book ${item.bookId} not available` }, { status: 400 });
      }

      const book = bookSnap.data() as {
        title: string;
        sellerId: string;
        sellerName: string;
        authorName: string;
        price: number;
        status: string;
        releaseDate?: { toMillis(): number };
        isPreorder?: boolean;
      };

      if (book.status !== 'live' || !Number.isSafeInteger(book.price) || book.price < 0 || book.price > MAX_BOOK_PRICE_CENTS) {
        return NextResponse.json({ error: `Book ${item.bookId} not available` }, { status: 400 });
      }
      if (book.isPreorder && (book.releaseDate?.toMillis() ?? Infinity) > Date.now()) {
        return NextResponse.json({ error: 'This book is not yet available for purchase.' }, { status: 409 });
      }

      try {
        validateBookContent(bookSnap.data()!, (await bookSnap.ref.collection('chapters').get()).docs);
      } catch (error) {
        if (!(error instanceof BookContentError)) throw error;
        return NextResponse.json({ error: `"${book.title}" is temporarily unavailable because its chapters are incomplete. No payment has been taken.` }, { status: 409 });
      }

      bookDetails.push({
        bookId: bookSnap.id,
        title: book.title,
        sellerId: book.sellerId,
        sellerName: book.sellerName,
        authorName: book.authorName,
        originalPrice: book.price,
      });
    }

    const pricing = calculateCartPricing(bookDetails.map(book => book.originalPrice), directSaleFee);
    // An author must finish Connect setup before a buyer can pay. This lets us
    // link royalties to the purchase charge while its funds are still settling.
    for (const sellerId of new Set(bookDetails.map(book => book.sellerId))) {
      const seller = (await adminDb.doc(`sellers/${sellerId}`).get()).data();
      if (!seller?.stripeAccountId || seller.payoutHoldReason) return NextResponse.json({ error: 'An author in your cart is still setting up payments. Please try again later.' }, { status: 409 });
      const account = await stripe.accounts.retrieve(seller.stripeAccountId);
      if ((await syncAuthorAccount(adminDb, sellerId, account)).stripeAccountStatus !== 'active') return NextResponse.json({ error: 'An author in your cart must complete Stripe payout setup before this purchase can proceed.' }, { status: 409 });
    }
    const { bundleDiscount, total: finalAmount } = pricing;
    if (finalAmount < 50) return NextResponse.json({ error: 'The checkout total must be at least $0.50.' }, { status: 400 });
    if (finalAmount > MAX_BOOK_PRICE_CENTS) return NextResponse.json({ error: 'The checkout total is too large. Please purchase fewer books at a time.' }, { status: 400 });
    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmount, currency: 'usd',
      metadata: { userId: requestUser.uid, bookIds: bookDetails.map(book => book.bookId).join(','), purchaseType: 'books', bundleDiscount: String(bundleDiscount) },
    });

    const orderIds: string[] = [];
    const orderBatch = adminDb.batch();

    for (const [index, book] of bookDetails.entries()) {
      const { discountAmount: lineDiscount, finalPrice, stripeFee, platformFee, sellerEarnings } = pricing.lines[index];

      const orderRef = adminDb.collection('orders').doc();
      orderBatch.create(orderRef, {
        buyerId: requestUser.uid,
        buyerEmail: requestUser.email,
        bookId: book.bookId,
        bookTitle: book.title,
        sellerId: book.sellerId,
        sellerName: book.sellerName,
        authorName: book.authorName,
        originalPrice: book.originalPrice,
        discountAmount: lineDiscount,
        finalPrice,
        promoCodeUsed: null,
        stripePaymentIntentId: paymentIntent.id,
        stripeFee,
        platformFee,
        sellerEarnings,
        platformFeePercent: directSaleFee,
        processingFeeBasis: 'estimated_us_domestic_card',
        pricingVersion: 2,
        status: 'pending',
        receiptEmailSent: false,
        createdAt: new Date(),
      });

      orderIds.push(orderRef.id);
    }
    await orderBatch.commit();

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      orderIds,
      amount: finalAmount,
    });
  } catch (err) {
    console.error('create-payment-intent error:', err);
    const status = err instanceof Error && err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Internal server error' }, { status });
  }
}
