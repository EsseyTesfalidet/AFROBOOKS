import { NextRequest, NextResponse } from 'next/server';
import { getStripeServer, calculateFees } from '@/lib/stripe/server';
import { getBook, getPlatformSettings } from '@/lib/firebase/firestore';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function POST(req: NextRequest) {
  try {
    const { items, userId, userEmail, promoCode, discountAmount = 0 } = await req.json();

    if (!items?.length || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const stripe = getStripeServer();
    const settings = await getPlatformSettings();

    let totalCents = 0;
    const bookDetails: { bookId: string; title: string; sellerId: string; sellerName: string; originalPrice: number }[] = [];

    for (const item of items) {
      const book = await getBook(item.bookId);
      if (!book || book.status !== 'live') {
        return NextResponse.json({ error: `Book ${item.bookId} not available` }, { status: 400 });
      }
      totalCents += book.price;
      bookDetails.push({
        bookId: book.id,
        title: book.title,
        sellerId: book.sellerId,
        sellerName: book.sellerName,
        originalPrice: book.price,
      });
    }

    const finalAmount = Math.max(0, totalCents - discountAmount);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmount,
      currency: 'usd',
      metadata: {
        userId,
        bookIds: bookDetails.map((b) => b.bookId).join(','),
        promoCode: promoCode ?? '',
        discountAmount: discountAmount.toString(),
      },
    });

    // Create pending order documents
    const orderIds: string[] = [];
    for (const book of bookDetails) {
      const { stripeFee, platformFee, sellerEarnings } = calculateFees(book.originalPrice);
      const ref = await addDoc(collection(db, 'orders'), {
        buyerId: userId,
        buyerEmail: userEmail,
        bookId: book.bookId,
        bookTitle: book.title,
        sellerId: book.sellerId,
        sellerName: book.sellerName,
        originalPrice: book.originalPrice,
        discountAmount: 0,
        finalPrice: book.originalPrice,
        promoCodeUsed: promoCode ?? null,
        stripePaymentIntentId: paymentIntent.id,
        stripeFee,
        platformFee,
        sellerEarnings,
        status: 'pending',
        receiptEmailSent: false,
        createdAt: serverTimestamp(),
      });
      orderIds.push(ref.id);
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      orderIds,
      amount: finalAmount,
    });
  } catch (err) {
    console.error('create-payment-intent error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
