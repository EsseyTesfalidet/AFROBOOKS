import { NextRequest, NextResponse } from 'next/server';
import { getStripeServer } from '@/lib/stripe/server';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from '@/types/user';

const PLAN_PRICE_IDS: Record<string, string> = {
  basic: process.env.STRIPE_BASIC_PRICE_ID ?? '',
  standard: process.env.STRIPE_STANDARD_PRICE_ID ?? '',
  premium: process.env.STRIPE_PREMIUM_PRICE_ID ?? '',
};

export async function POST(req: NextRequest) {
  try {
    const { plan, userId } = await req.json();
    if (!plan || !userId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const stripe = getStripeServer();
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const user = userSnap.data() as User;

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId },
      });
      customerId = customer.id;
      await updateDoc(doc(db, 'users', userId), {
        stripeCustomerId: customerId,
        updatedAt: serverTimestamp(),
      });
    }

    // Create subscription
    const priceId = PLAN_PRICE_IDS[plan];
    if (!priceId) {
      // Fallback: create with inline price
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          price_data: {
            currency: 'usd',
            product_data: { name: `AfroBooks ${plan.charAt(0).toUpperCase() + plan.slice(1)}` },
            unit_amount: plan === 'basic' ? 499 : plan === 'standard' ? 999 : 1499,
            recurring: { interval: 'month' },
          } as any,
        }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
        metadata: { userId, plan },
      });

      const invoice = subscription.latest_invoice as { payment_intent?: { client_secret?: string | null } };
      return NextResponse.json({
        subscriptionId: subscription.id,
        clientSecret: invoice?.payment_intent?.client_secret ?? null,
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId, plan },
    });

    const invoice = subscription.latest_invoice as { payment_intent?: { client_secret?: string | null } };
    return NextResponse.json({
      subscriptionId: subscription.id,
      clientSecret: invoice?.payment_intent?.client_secret ?? null,
    });
  } catch (err) {
    console.error('create-subscription error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
