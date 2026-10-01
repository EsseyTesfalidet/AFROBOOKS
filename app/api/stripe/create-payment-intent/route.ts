import { NextRequest, NextResponse } from 'next/server';
import { getStripeServer, calculateFees } from '@/lib/stripe/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { agreementRequiredResponse } from '@/lib/server/legalAgreement';
import { z } from 'zod';
import { validateBookContent, BookContentError } from '@/lib/server/bookContent';
import { paymentConfiguration } from '@/lib/stripe/config';
import { calculateCartPricing, MAX_BOOK_PRICE_CENTS, cartMinimum, minimumPublicationPrice } from '@/lib/utils/fees';
import { syncAuthorAccount } from '@/lib/server/authorPayments';
import { giftCheckoutSchema } from '@/lib/gifts';
import { prepareBookGift, attachGiftPayment, GiftError } from '@/lib/server/bookGifts';
import { giftEmailConfiguration } from '@/lib/server/giftEmail';
import { bookRouting, routingParameters, type BookRouting } from '@/lib/stripe/bookRouting';
import { createBookPurchase, BookPurchaseError } from '@/lib/server/bookPurchases';
import { publicationTitle } from '@/lib/utils/publication';
import { settleUnpaidRefunds } from '@/lib/server/settleUnpaidRefunds';

const checkoutSchema = z.object({
  items: z.array(z.object({ bookId: z.string().min(1).max(128).regex(/^[^/]+$/) })).min(1).max(20),
  promoCode: z.string().max(100).nullable().optional(),
  promoBookId: z.string().max(128).nullable().optional(),
  discountAmount: z.number().finite().nonnegative().optional(),
  gift: giftCheckoutSchema.optional(),
});

export async function POST(req: NextRequest) {
  try {
    const requestUser = await requireRequestUser(req);
    const agreementError = agreementRequiredResponse(requestUser);
    if (agreementError) return agreementError;
    if (!paymentConfiguration(process.env).checkoutReady) return NextResponse.json({ error: 'Payments are temporarily unavailable. Please try again later.' }, { status: 503 });
    const parsed = checkoutSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid checkout' }, { status: 400 });
    const { items, promoCode, discountAmount = 0, gift } = parsed.data;
    if (gift && items.length !== 1) return NextResponse.json({ error: 'Choose one book per gift.' }, { status: 400 });
    if (gift && !giftEmailConfiguration()) return NextResponse.json({ error: 'Book gifting is temporarily unavailable. Please try again later.' }, { status: 503 });

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

      if (book.status !== 'live' || !Number.isSafeInteger(book.price) || book.price < minimumPublicationPrice(bookSnap.data()?.publicationType) || book.price > MAX_BOOK_PRICE_CENTS) {
        return NextResponse.json({ error: `Book ${item.bookId} not available` }, { status: 400 });
      }
      if (book.isPreorder && (book.releaseDate?.toMillis() ?? Infinity) > Date.now()) {
        return NextResponse.json({ error: 'This book is not yet available for purchase.' }, { status: 409 });
      }

      try {
        validateBookContent(bookSnap.data()!, (await bookSnap.ref.collection('chapters').get()).docs, (await adminDb.doc(`publicationFiles/${bookSnap.id}`).get()).data());
      } catch (error) {
        if (!(error instanceof BookContentError)) throw error;
        return NextResponse.json({ error: `"${book.title}" is temporarily unavailable because its chapters are incomplete. No payment has been taken.` }, { status: 409 });
      }

      bookDetails.push({
        bookId: bookSnap.id,
        title: publicationTitle({ ...bookSnap.data(), title: book.title }),
        sellerId: book.sellerId,
        sellerName: book.sellerName,
        authorName: book.authorName,
        originalPrice: book.price,
      });
    }

    const pricing = calculateCartPricing(bookDetails.map(book => book.originalPrice), directSaleFee);
    const minimum = cartMinimum(bookDetails.map(book => book.originalPrice));
    if (minimum.remaining) return NextResponse.json({ error: `Add $${(minimum.remaining / 100).toFixed(2)} more to your discounted cart. These titles are paid together in one payment with a $${(minimum.minimum / 100).toFixed(2)} minimum.`, code: 'CART_MINIMUM', minimumCents: minimum.minimum, remainingCents: minimum.remaining }, { status: 409 });
    // An author must finish Connect setup before a buyer can pay. This lets us
    // link royalties to the purchase charge while its funds are still settling.
    const authorAccounts = new Map<string, string>();
    const destinationEnabled = process.env.STRIPE_DESTINATION_CHARGES_ENABLED === 'true' && settings?.automatedPayoutsEnabled === true;
    const platformCountry = destinationEnabled ? (await stripe.accounts.retrieve()).country : undefined;
    let destinationRegionEligible = !!platformCountry;
    for (const sellerId of new Set(bookDetails.map(book => book.sellerId))) {
      const sellerRef = adminDb.doc(`sellers/${sellerId}`);
      let seller = (await sellerRef.get()).data();
      if (seller?.payoutHoldReason === 'payment_review' && await settleUnpaidRefunds(adminDb, stripe, sellerId)) seller = (await sellerRef.get()).data();
      if (!seller?.stripeAccountId) return NextResponse.json({ error: 'An author in your cart is still setting up payments. Please try again later.', code: 'AUTHOR_SETUP_REQUIRED' }, { status: 409 });
      if (seller.payoutHoldReason) return NextResponse.json({ error: 'An author’s payments are temporarily under review. No payment has been taken. Please try again later.', code: 'AUTHOR_PAYMENT_REVIEW' }, { status: 409 });
      const account = await stripe.accounts.retrieve(seller.stripeAccountId);
      if ((await syncAuthorAccount(adminDb, sellerId, account)).stripeAccountStatus !== 'active') return NextResponse.json({ error: 'An author in your cart must complete Stripe payout setup before this purchase can proceed.' }, { status: 409 });
      authorAccounts.set(sellerId, account.id);
      // Cross-region settlement can need on_behalf_of and extra capabilities.
      // Keep the existing transfer path until that account setup is supported.
      if (account.country !== platformCountry) destinationRegionEligible = false;
    }
    const { bundleDiscount, total: finalAmount } = pricing;
    if (finalAmount < 50) return NextResponse.json({ error: 'The checkout total must be at least $0.50.' }, { status: 400 });
    if (finalAmount > MAX_BOOK_PRICE_CENTS) return NextResponse.json({ error: 'The checkout total is too large. Please purchase fewer books at a time.' }, { status: 400 });
    const routing = bookRouting(authorAccounts, finalAmount, pricing.sellerEarnings,
      destinationEnabled && destinationRegionEligible);
    if (gift) {
      const book = bookDetails[0];
      const sender = (await adminDb.doc(`users/${requestUser.uid}`).get()).data();
      const prepared = await prepareBookGift(adminDb, {
        ...gift, senderId: requestUser.uid,
        senderName: [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || 'An AfroBooks reader',
        order: {
          buyerId: requestUser.uid, buyerEmail: requestUser.email ?? '', bookId: book.bookId, bookTitle: book.title,
          sellerId: book.sellerId, sellerName: book.sellerName, authorName: book.authorName,
          ...pricing.lines[0], promoCodeUsed: null,
          platformFeePercent: directSaleFee, processingFeeBasis: 'estimated_us_domestic_card', pricingVersion: 2,
          status: 'pending', receiptEmailSent: false, ...routing,
        },
      });
      // Retries must use the original routing, including checkouts created
      // before destination charges were enabled or an account was changed.
      const savedOrder = (await adminDb.doc(`orders/${prepared.orderId}`).get()).data()!;
      const savedRouting: BookRouting = { chargeRouting: savedOrder.chargeRouting ?? 'separate', destinationAccountId: savedOrder.destinationAccountId ?? null, applicationFeeAmount: savedOrder.applicationFeeAmount ?? 0 };
      if (!prepared.paymentIntentId && savedRouting.chargeRouting === 'destination' && savedRouting.destinationAccountId !== authorAccounts.get(book.sellerId)) return NextResponse.json({ error: 'This gift checkout needs payment review. Please contact support before paying.' }, { status: 409 });
      const intent = prepared.paymentIntentId ? await stripe.paymentIntents.retrieve(prepared.paymentIntentId) : await stripe.paymentIntents.create({
        amount: finalAmount, currency: 'usd',
        ...routingParameters(savedRouting),
        metadata: { userId: requestUser.uid, bookIds: book.bookId, purchaseType: 'books', giftId: prepared.id },
      }, { idempotencyKey: `afrobooks-gift-${prepared.id}` });
      await attachGiftPayment(adminDb, prepared.id, intent.id);
      return NextResponse.json({ clientSecret: intent.client_secret, orderIds: [prepared.orderId], amount: intent.amount, paymentStatus: intent.status });
    }
    const drafts = bookDetails.map((book, index) => {
      const { discountAmount: lineDiscount, finalPrice, stripeFee, platformFee, sellerEarnings } = pricing.lines[index];

      return {
        buyerId: requestUser.uid,
        buyerEmail: requestUser.email ?? '',
        bookId: book.bookId,
        bookTitle: book.title,
        sellerId: book.sellerId,
        sellerName: book.sellerName,
        authorName: book.authorName,
        originalPrice: book.originalPrice,
        discountAmount: lineDiscount,
        finalPrice,
        promoCodeUsed: null,
        stripeFee,
        platformFee,
        sellerEarnings,
        platformFeePercent: directSaleFee,
        processingFeeBasis: 'estimated_us_domestic_card',
        pricingVersion: 2,
        ...routing,
        status: 'pending',
        receiptEmailSent: false,
      };
    });
    const { payment: paymentIntent, orderIds } = await createBookPurchase(adminDb, stripe.paymentIntents, requestUser.uid, drafts, {
      amount: finalAmount, currency: 'usd', ...routingParameters(routing),
      metadata: { userId: requestUser.uid, bookIds: bookDetails.map(book => book.bookId).join(','), purchaseType: 'books', bundleDiscount: String(bundleDiscount) },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      orderIds,
      amount: paymentIntent.amount,
      paymentStatus: paymentIntent.status,
    });
  } catch (err) {
    if (err instanceof BookPurchaseError) return NextResponse.json({ error: err.message, code: err.code, ownedBookIds: err.bookIds, orderIds: err.orderIds }, { status: 409 });
    if (err instanceof GiftError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('create-payment-intent error:', err);
    const status = err instanceof Error && err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Internal server error' }, { status });
  }
}
