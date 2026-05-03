import { NextRequest, NextResponse } from 'next/server';
import { getStripeServer } from '@/lib/stripe/server';
import { db } from '@/lib/firebase/config';
import {
  collection, query, where, getDocs,
  doc, updateDoc, addDoc, increment, serverTimestamp,
} from 'firebase/firestore';

export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const stripe = getStripeServer();
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as { id: string; metadata: Record<string, string> };
    const { userId, bookIds, promoCode } = pi.metadata;
    const bookIdList = bookIds.split(',').filter(Boolean);

    // Update all pending orders for this payment intent
    const ordersQ = query(collection(db, 'orders'), where('stripePaymentIntentId', '==', pi.id), where('status', '==', 'pending'));
    const ordersSnap = await getDocs(ordersQ);

    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data();
      await updateDoc(orderDoc.ref, { status: 'completed' });

      // Add to library
      await addDoc(collection(db, 'library'), {
        id: `${userId}_${order.bookId}`,
        userId,
        bookId: order.bookId,
        purchaseType: 'bought',
        orderId: orderDoc.id,
        addedAt: serverTimestamp(),
      }).catch(() => {});

      // Add earnings to seller pending balance
      await updateDoc(doc(db, 'sellers', order.sellerId), {
        pendingBalance: increment(order.sellerEarnings),
        totalSales: increment(1),
      }).catch(() => {});

      // Update book sales count
      await updateDoc(doc(db, 'books', order.bookId), {
        totalSales: increment(1),
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      // Notify buyer
      await addDoc(collection(db, 'notifications'), {
        userId,
        type: 'purchase',
        title: 'Purchase Successful',
        message: `You now own "${order.bookTitle}". Start reading anytime.`,
        isRead: false,
        actionUrl: `/read/${order.bookId}`,
        relatedBookId: order.bookId,
        createdAt: serverTimestamp(),
      });

      // Notify seller
      await addDoc(collection(db, 'notifications'), {
        userId: order.sellerId,
        type: 'sale',
        title: 'New Sale',
        message: `"${order.bookTitle}" was purchased.`,
        isRead: false,
        actionUrl: '/dashboard',
        relatedBookId: order.bookId,
        createdAt: serverTimestamp(),
      });
    }
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as {
      id: string; customer: string; status: string;
      current_period_start: number; current_period_end: number;
      cancel_at_period_end: boolean; metadata: Record<string, string>;
    };
    const { userId, plan } = sub.metadata;
    if (userId && plan) {
      await updateDoc(doc(db, 'users', userId), {
        subscriptionId: sub.id,
        subscriptionPlan: plan,
        subscriptionStatus: sub.status === 'active' ? 'active' : 'past_due',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as { metadata: Record<string, string> };
    const { userId } = sub.metadata;
    if (userId) {
      await updateDoc(doc(db, 'users', userId), {
        subscriptionPlan: 'none',
        subscriptionStatus: 'cancelled',
        subscriptionId: null,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ received: true });
}
