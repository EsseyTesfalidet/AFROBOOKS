import { NextRequest, NextResponse } from 'next/server';
import { getStripeServer, calculateFees } from '@/lib/stripe/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';

function distributeDiscounts(amounts: number[], totalDiscount: number) {
  if (totalDiscount <= 0 || !amounts.length) {
    return amounts.map(() => 0);
  }

  const subtotal = amounts.reduce((sum, amount) => sum + amount, 0);
  if (subtotal <= 0) {
    return amounts.map(() => 0);
  }

  const rawShares = amounts.map((amount) => (amount / subtotal) * totalDiscount);
  const shares = rawShares.map((share) => Math.floor(share));
  let remainder = totalDiscount - shares.reduce((sum, share) => sum + share, 0);

  const ranked = rawShares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const item of ranked) {
    if (remainder <= 0) break;
    shares[item.index] += 1;
    remainder -= 1;
  }

  return shares;
}

export async function POST(req: NextRequest) {
  try {
    const requestUser = await requireRequestUser(req);
    const { items, promoCode, promoBookId, discountAmount = 0 } = await req.json();

    if (!items?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const stripe = getStripeServer();
    const adminDb = await getAdminDb();

    let subtotal = 0;
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
      };

      if (book.status !== 'live') {
        return NextResponse.json({ error: `Book ${item.bookId} not available` }, { status: 400 });
      }

      subtotal += book.price;
      bookDetails.push({
        bookId: bookSnap.id,
        title: book.title,
        sellerId: book.sellerId,
        sellerName: book.sellerName,
        authorName: book.authorName,
        originalPrice: book.price,
      });
    }

    const bundleDiscount = bookDetails.length >= 3 ? Math.round(subtotal * 0.05) : 0;
    let promoDiscount = 0;

    if (promoCode && promoBookId && discountAmount > 0) {
      const promoSnap = await adminDb
        .collection('promoCodes')
        .where('code', '==', String(promoCode).trim().toUpperCase())
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (!promoSnap.empty) {
        const promoDoc = promoSnap.docs[0];
        const promo = promoDoc.data() as {
          sellerId: string;
          discountType: 'percentage' | 'fixed' | 'free';
          discountValue: number;
          applyTo: 'all' | 'specific';
          specificBookId: string | null;
          maxUses: number | null;
          currentUses: number;
          expiryDate?: { toMillis?: () => number };
        };

        const targetBook = bookDetails.find((book) => book.bookId === promoBookId);
        const notExpired = (promo.expiryDate?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) >= Date.now();
        const hasUsesLeft =
          promo.maxUses == null || (promo.currentUses ?? 0) < promo.maxUses;
        const appliesToTarget =
          !!targetBook &&
          promo.sellerId === targetBook.sellerId &&
          (promo.applyTo === 'all' || promo.specificBookId === promoBookId);

        if (targetBook && notExpired && hasUsesLeft && appliesToTarget) {
          const rawPromoDiscount =
            promo.discountType === 'percentage'
              ? Math.round(targetBook.originalPrice * (promo.discountValue / 100))
              : promo.discountType === 'fixed'
                ? promo.discountValue
                : targetBook.originalPrice;
          promoDiscount = Math.min(targetBook.originalPrice, rawPromoDiscount, discountAmount);
        }
      }
    }

    const finalAmount = Math.max(0, subtotal - bundleDiscount - promoDiscount);
    const bundleShares = distributeDiscounts(
      bookDetails.map((book) => book.originalPrice),
      bundleDiscount
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmount,
      currency: 'usd',
      metadata: {
        userId: requestUser.uid,
        bookIds: bookDetails.map((book) => book.bookId).join(','),
        promoCode: promoCode ?? '',
        promoBookId: promoBookId ?? '',
        promoDiscount: String(promoDiscount),
        bundleDiscount: String(bundleDiscount),
      },
    });

    const orderIds: string[] = [];

    for (const [index, book] of bookDetails.entries()) {
      const promoShare = book.bookId === promoBookId ? promoDiscount : 0;
      const lineDiscount = bundleShares[index] + promoShare;
      const finalPrice = Math.max(0, book.originalPrice - lineDiscount);
      const { stripeFee, platformFee, sellerEarnings } = calculateFees(finalPrice);

      const orderRef = await adminDb.collection('orders').add({
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
        promoCodeUsed: promoShare > 0 ? promoCode ?? null : null,
        stripePaymentIntentId: paymentIntent.id,
        stripeFee,
        platformFee,
        sellerEarnings,
        status: 'pending',
        receiptEmailSent: false,
        createdAt: new Date(),
      });

      orderIds.push(orderRef.id);
    }

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
