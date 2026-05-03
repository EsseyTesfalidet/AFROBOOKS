import { NextRequest, NextResponse } from 'next/server';
import { getStripeServer } from '@/lib/stripe/server';
import { db } from '@/lib/firebase/config';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const stripe = getStripeServer();
  const account = await stripe.accounts.create({
    type: 'express',
    metadata: { userId },
  });

  await updateDoc(doc(db, 'sellers', userId), {
    stripeAccountId: account.id,
    stripeAccountStatus: 'pending',
    updatedAt: serverTimestamp(),
  }).catch(() => {});

  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller/profile/payout?reauth=1`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller/profile/payout?connected=1`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: link.url });
}
