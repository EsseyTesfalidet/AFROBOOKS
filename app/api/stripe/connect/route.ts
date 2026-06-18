import { NextRequest, NextResponse } from 'next/server';
import { getStripeServer } from '@/lib/stripe/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';

export async function GET(req: NextRequest) {
  try {
    const requestUser = await requireRequestUser(req);
    if (!['seller', 'both', 'admin'].includes(requestUser.role)) {
      return NextResponse.json({ error: 'Author account required' }, { status: 403 });
    }
    const stripe = getStripeServer();
    const adminDb = await getAdminDb();

    const sellerRef = adminDb.collection('sellers').doc(requestUser.uid);
    const sellerSnap = await sellerRef.get();
    const existingAccountId = sellerSnap.data()?.stripeAccountId as string | undefined;

    const account =
      existingAccountId
        ? await stripe.accounts.retrieve(existingAccountId)
        : await stripe.accounts.create({
            type: 'express',
            metadata: { userId: requestUser.uid },
          });

    await sellerRef.set(
      {
        uid: requestUser.uid,
        stripeAccountId: account.id,
        stripeAccountStatus: account.details_submitted ? 'active' : 'pending',
        updatedAt: new Date(),
      },
      { merge: true }
    );

    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller/profile/payout?reauth=1`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller/profile/payout?connected=1`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ url: link.url });
  } catch (err) {
    console.error('stripe connect error:', err);
    const status = err instanceof Error && err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Internal server error' }, { status });
  }
}
