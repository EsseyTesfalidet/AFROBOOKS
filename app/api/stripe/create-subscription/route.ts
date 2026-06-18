import { NextRequest, NextResponse } from 'next/server';
import { getStripeServer } from '@/lib/stripe/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';

const PLAN_PRICE_IDS: Record<string, string> = {
  basic: process.env.STRIPE_BASIC_PRICE_ID ?? '',
  standard: process.env.STRIPE_STANDARD_PRICE_ID ?? '',
  premium: process.env.STRIPE_PREMIUM_PRICE_ID ?? '',
};

const PLAN_AMOUNTS: Record<string, number> = {
  basic: 499,
  standard: 999,
  premium: 1499,
};

export async function POST(req: NextRequest) {
  try {
    const requestUser = await requireRequestUser(req);
    const { plan } = await req.json();

    if (!plan || !PLAN_AMOUNTS[plan]) {
      return NextResponse.json({ error: 'Missing or invalid plan' }, { status: 400 });
    }

    const stripe = getStripeServer();
    const adminDb = await getAdminDb();
    const settingsSnap = await adminDb.collection('platformSettings').doc('global').get();
    const settings = settingsSnap.data() ?? {};

    if (settings.maintenanceMode === true || settings.subscriptionSalesActive === false) {
      return NextResponse.json({ error: 'Subscriptions are currently unavailable' }, { status: 403 });
    }

    const userSnap = await adminDb.collection('users').doc(requestUser.uid).get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userSnap.data() as {
      email: string;
      firstName: string;
      lastName: string;
      stripeCustomerId: string | null;
    };

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId: requestUser.uid },
      });
      customerId = customer.id;
      await adminDb.collection('users').doc(requestUser.uid).update({
        stripeCustomerId: customerId,
        updatedAt: new Date(),
      });
    }

    const priceId = PLAN_PRICE_IDS[plan];
    const subscription =
      priceId
        ? await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent'],
            metadata: { userId: requestUser.uid, plan },
          })
        : await stripe.subscriptions.create({
            customer: customerId,
            items: [{
              price_data: {
                currency: 'usd',
                product_data: { name: `AfroBooks ${plan.charAt(0).toUpperCase() + plan.slice(1)}` },
                unit_amount: PLAN_AMOUNTS[plan],
                recurring: { interval: 'month' },
              } as any,
            }],
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent'],
            metadata: { userId: requestUser.uid, plan },
          });

    const invoice = subscription.latest_invoice as {
      payment_intent?: { client_secret?: string | null };
    };

    return NextResponse.json({
      subscriptionId: subscription.id,
      clientSecret: invoice?.payment_intent?.client_secret ?? null,
    });
  } catch (err) {
    console.error('create-subscription error:', err);
    const status = err instanceof Error && err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Internal server error' }, { status });
  }
}
