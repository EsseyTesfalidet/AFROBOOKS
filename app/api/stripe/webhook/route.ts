import type Stripe from 'stripe';
import { syncSubscription } from '@/lib/server/syncSubscription';
import { NextRequest, NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStripeServer } from '@/lib/stripe/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { sendPurchaseReceiptEmail } from '@/lib/server/email';
import { fulfillPayment, type SuccessfulPayment } from '@/lib/server/fulfillPayment';
import { paymentConfiguration } from '@/lib/stripe/config';

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }
  if (!paymentConfiguration(process.env).checkoutReady) return NextResponse.json({ error: 'Payments are not configured' }, { status: 503 });
  const stripe = getStripeServer();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  const adminDb = await getAdminDb();

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as SuccessfulPayment;
    if (!pi.metadata.bookIds && pi.metadata.purchaseType !== 'books') return NextResponse.json({ received: true });
    try {
      await fulfillPayment(adminDb, pi);
    } catch (error) {
      console.error('Payment fulfillment failed:', error);
      return NextResponse.json({ error: 'Fulfillment incomplete; retry required' }, { status: 500 });
    }
    const ordersSnap = await adminDb.collection('orders').where('stripePaymentIntentId', '==', pi.id).get();
    const orders = ordersSnap.docs.map((doc) => doc.data());
    const buyer = (await adminDb.collection('users').doc(pi.metadata.userId).get()).data();
    if (buyer?.email && orders.every(order => order.status === 'completed') && orders.some((order) => !order.receiptEmailSent)) {
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

  if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    try {
      const eventSub = event.data.object as Stripe.Subscription;
      const latest = await stripe.subscriptions.retrieve(eventSub.id);
      await syncSubscription(adminDb, latest);
    } catch (error) {
      console.error('Subscription synchronization failed:', error);
      return NextResponse.json({ error: 'Subscription synchronization incomplete; retry required' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
