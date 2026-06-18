import { NextRequest, NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStripeServer } from '@/lib/stripe/server';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase/admin';
import { sendPurchaseReceiptEmail, sendSubscriptionConfirmation } from '@/lib/server/email';
import { DEFAULT_SELLER_VERIFICATION_STATUS, hasCompletedSellerVerification } from '@/lib/sellerVerification';

export async function POST(req: NextRequest) {
  const stripe = getStripeServer();
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  const adminDb = await getAdminDb();
  const FieldValue = await getAdminFieldValue();

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as { id: string; metadata: Record<string, string> };
    const { userId, promoCode } = pi.metadata;

    const ordersSnap = await adminDb
      .collection('orders')
      .where('stripePaymentIntentId', '==', pi.id)
      .where('status', '==', 'pending')
      .get();

    const receiptItems: { title: string; authorName: string; priceCents: number }[] = [];
    let totalCharged = 0;
    let buyerEmail: string | null = null;
    let buyerName = 'Reader';

    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data() as {
        buyerEmail: string | null;
        bookId: string;
        bookTitle: string;
        authorName?: string;
        sellerId: string;
        sellerEarnings: number;
        finalPrice: number;
      };

      await orderDoc.ref.update({ status: 'completed' });

      await adminDb.collection('library').doc(`${userId}_${order.bookId}`).set(
        {
          id: `${userId}_${order.bookId}`,
          userId,
          bookId: order.bookId,
          purchaseType: 'bought',
          orderId: orderDoc.id,
          addedAt: new Date(),
        },
        { merge: true }
      );

      const sellerRef = adminDb.collection('sellers').doc(order.sellerId);
      const sellerSnap = await sellerRef.get();
      const sellerData = sellerSnap.data() ?? {};
      const sellerUserSnap = await adminDb.collection('users').doc(order.sellerId).get();
      const sellerBioLength = (((sellerUserSnap.data() as { bio?: string } | undefined)?.bio ?? '').trim().length);
      const nextTotalSales = (sellerData.totalSales ?? 0) + 1;
      const nextVerificationStatus = {
        ...DEFAULT_SELLER_VERIFICATION_STATUS,
        ...(sellerData.verificationStatus ?? {}),
        emailVerified: sellerData.verificationStatus?.emailVerified ?? true,
        bioAdded: sellerBioLength >= 50,
        firstBookPublished: true,
        tenSalesReached: nextTotalSales >= 10,
      };
      await sellerRef.set(
        {
          pendingBalance: FieldValue.increment(order.sellerEarnings),
          totalEarnings: FieldValue.increment(order.sellerEarnings),
          totalSales: FieldValue.increment(1),
          verificationStatus: nextVerificationStatus,
          isVerified: hasCompletedSellerVerification(nextVerificationStatus),
          updatedAt: new Date(),
        },
        { merge: true }
      );

      await adminDb.collection('books').doc(order.bookId).set(
        {
          totalSales: FieldValue.increment(1),
          updatedAt: new Date(),
        },
        { merge: true }
      );

      await adminDb.collection('notifications').add({
        userId,
        type: 'purchase',
        title: 'Purchase Successful',
        message: `You now own "${order.bookTitle}". Start reading anytime.`,
        isRead: false,
        actionUrl: `/read/${order.bookId}`,
        relatedBookId: order.bookId,
        createdAt: new Date(),
      });

      await adminDb.collection('notifications').add({
        userId: order.sellerId,
        type: 'sale',
        title: 'New Sale',
        message: `"${order.bookTitle}" was purchased.`,
        isRead: false,
        actionUrl: '/dashboard',
        relatedBookId: order.bookId,
        createdAt: new Date(),
      });

      receiptItems.push({
        title: order.bookTitle,
        authorName: order.authorName ?? 'Unknown Author',
        priceCents: order.finalPrice,
      });
      totalCharged += order.finalPrice;
      buyerEmail = order.buyerEmail;
    }

    const buyerSnap = await adminDb.collection('users').doc(userId).get();
    if (buyerSnap.exists) {
      const buyer = buyerSnap.data() as { firstName?: string; lastName?: string };
      buyerName = [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || 'Reader';
    }

    if (promoCode) {
      const promoSnap = await adminDb
        .collection('promoCodes')
        .where('code', '==', promoCode)
        .limit(1)
        .get();

      if (!promoSnap.empty) {
        await promoSnap.docs[0].ref.set(
          {
            currentUses: FieldValue.increment(1),
            totalRevenue: FieldValue.increment(totalCharged),
          },
          { merge: true }
        );
      }
    }

    if (buyerEmail && receiptItems.length) {
      const sent = await sendPurchaseReceiptEmail({
        to: buyerEmail,
        buyerName,
        items: receiptItems,
        totalCents: totalCharged,
        orderId: ordersSnap.docs[0]?.id ?? pi.id,
      }).catch(() => false);

      if (sent) {
        await Promise.all(
          ordersSnap.docs.map((orderDoc: QueryDocumentSnapshot) =>
            orderDoc.ref.update({ receiptEmailSent: true })
          )
        );
      }
    }
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as {
      id: string;
      status: string;
      metadata: Record<string, string>;
    };
    const { userId, plan } = sub.metadata;

    if (userId && plan) {
      await adminDb.collection('users').doc(userId).set(
        {
          subscriptionId: sub.id,
          subscriptionPlan: plan,
          subscriptionStatus: sub.status === 'active' ? 'active' : 'past_due',
          updatedAt: new Date(),
        },
        { merge: true }
      );

      if (sub.status === 'active') {
        const userSnap = await adminDb.collection('users').doc(userId).get();
        const user = userSnap.data() as
          | { email?: string; firstName?: string; lastName?: string }
          | undefined;
        if (user?.email) {
          await sendSubscriptionConfirmation({
            to: user.email,
            userName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Reader',
            plan: plan as 'basic' | 'standard' | 'premium',
            amountCents: plan === 'basic' ? 499 : plan === 'standard' ? 999 : 1499,
          }).catch(() => false);
        }
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as { metadata: Record<string, string> };
    const { userId } = sub.metadata;
    if (userId) {
      await adminDb.collection('users').doc(userId).set(
        {
          subscriptionPlan: 'none',
          subscriptionStatus: 'cancelled',
          subscriptionId: null,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }
  }

  return NextResponse.json({ received: true });
}
