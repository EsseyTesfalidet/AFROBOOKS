import { NextRequest, NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStripeServer } from '@/lib/stripe/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { sendPurchaseReceiptEmail, sendSubscriptionConfirmation } from '@/lib/server/email';
import { fulfillPayment, type SuccessfulPayment } from '@/lib/server/fulfillPayment';

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

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as SuccessfulPayment;
    try {
      await fulfillPayment(adminDb, pi);
    } catch (error) {
      console.error('Payment fulfillment failed:', error);
      return NextResponse.json({ error: 'Fulfillment incomplete; retry required' }, { status: 500 });
    }
    const ordersSnap = await adminDb.collection('orders').where('stripePaymentIntentId', '==', pi.id).get();
    const orders = ordersSnap.docs.map((doc) => doc.data());
    const buyer = (await adminDb.collection('users').doc(pi.metadata.userId).get()).data();
    if (buyer?.email && orders.some((order) => !order.receiptEmailSent)) {
      const sent = await sendPurchaseReceiptEmail({
        to: buyer.email,
        buyerName: [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || 'Reader',
        items: orders.map((order) => ({ title: order.bookTitle, authorName: order.authorName ?? 'Unknown Author', priceCents: order.finalPrice })),
        totalCents: pi.amount_received,
        orderId: pi.id,
      }).catch(() => false);
      if (sent) await Promise.all(ordersSnap.docs.map((doc: QueryDocumentSnapshot) => doc.ref.update({ receiptEmailSent: true })));
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
