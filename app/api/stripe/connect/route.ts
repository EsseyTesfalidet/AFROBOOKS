import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';
import { getStripeServer } from '@/lib/stripe/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { syncAuthorAccount } from '@/lib/server/authorPayments';

async function context(req: NextRequest) {
  const user = await requireRequestUser(req);
  if (!['seller', 'both', 'admin'].includes(user.role)) throw new Error('Author account required');
  const db = await getAdminDb();
  const sellerRef = db.doc(`sellers/${user.uid}`);
  const seller = (await sellerRef.get()).data();
  if (!seller) throw new Error('Author account required');
  return { user, db, sellerRef, seller, stripe: getStripeServer() };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Unauthorized') return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (message === 'Author account required') return NextResponse.json({ error: message }, { status: 403 });
  console.error('Stripe author account request failed', { code: (error as { code?: string })?.code ?? 'unavailable' });
  return NextResponse.json({ error: 'Stripe payout setup is temporarily unavailable. Please try again.' }, { status: 503 });
}

// Refreshes Stripe's actual eligibility; returning from onboarding is not proof
// that an author has completed identity checks or can receive payouts.
export async function GET(req: NextRequest) {
  try {
    const { user, db, seller, stripe } = await context(req);
    const enabled = (await db.doc('platformSettings/global').get()).data()?.automatedPayoutsEnabled === true;
    if (!seller.stripeAccountId) return NextResponse.json({ connected: false, ready: false, enabled }, { headers: { 'Cache-Control': 'no-store' } });
    const account = await stripe.accounts.retrieve(seller.stripeAccountId);
    const readiness = await syncAuthorAccount(db, user.uid, account);
    let balance: { amount: number; currency: string }[] = [];
    let pendingBalance: { amount: number; currency: string }[] = [];
    let bankPayouts: { id: string; amount: number; currency: string; status: string; arrivalDate: number; failureMessage: string | null }[] = [];
    let historyAvailable = true;
    try {
      const [funds, payouts] = await Promise.all([
        stripe.balance.retrieve({}, { stripeAccount: account.id }),
        stripe.payouts.list({ limit: 10 }, { stripeAccount: account.id }),
      ]);
      balance = funds.available.map(item => ({ amount: item.amount, currency: item.currency }));
      pendingBalance = funds.pending.map(item => ({ amount: item.amount, currency: item.currency }));
      bankPayouts = payouts.data.map(item => ({ id: item.id, amount: item.amount, currency: item.currency, status: item.status, arrivalDate: item.arrival_date, failureMessage: item.failure_message }));
    } catch { historyAvailable = false; }
    return NextResponse.json({
      connected: true, ready: readiness.stripeAccountStatus === 'active', enabled,
      country: readiness.stripeCountry, requirementsDue: readiness.stripeRequirementsDue.length,
      pendingVerification: (account.requirements?.pending_verification?.length ?? 0) > 0,
      payoutHold: !!seller.payoutHoldReason, balance, pendingBalance, bankPayouts, historyAvailable,
      schedule: account.settings?.payouts?.schedule?.interval ?? null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

const actionSchema = z.object({ action: z.enum(['onboarding', 'dashboard']).default('onboarding') });
export async function POST(req: NextRequest) {
  try {
    const { user, db, seller, sellerRef, stripe } = await context(req);
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payout action.' }, { status: 400 });
    let account: Stripe.Account | undefined;
    if (seller.stripeAccountId) account = await stripe.accounts.retrieve(seller.stripeAccountId);
    else {
      // Recover an account if a previous Stripe creation succeeded but its
      // Firestore write failed. Do not strand it or create duplicate accounts.
      for await (const candidate of stripe.accounts.list({ limit: 100 })) {
        if (candidate.metadata?.userId === user.uid) {
          if (account) throw new Error('Multiple Stripe accounts require review');
          account = candidate;
        }
      }
      if (!account) account = await stripe.accounts.create({
        // Supplying country or capabilities here locks the country before the
        // author can choose. Stripe requests capabilities from platform options.
        type: 'express', email: user.email ?? undefined,
        business_profile: { product_description: 'Book author receiving royalties from AfroBooks' },
        metadata: { userId: user.uid },
      }, { idempotencyKey: `afrobooks-author-${user.uid}` });
      const id = account.id;
      await db.runTransaction(async tx => {
        const latest = await tx.get(sellerRef);
        if (!latest.exists || (latest.data()?.stripeAccountId && latest.data()?.stripeAccountId !== id)) throw new Error('Author account changed');
        tx.update(sellerRef, { stripeAccountId: id, updatedAt: new Date() });
      });
    }
    const readiness = await syncAuthorAccount(db, user.uid, account);
    if (parsed.data.action === 'dashboard' && readiness.stripeAccountStatus === 'active') {
      const link = await stripe.accounts.createLoginLink(account.id);
      return NextResponse.json({ url: link.url }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const base = process.env.NEXT_PUBLIC_APP_URL;
    if (!base || !base.startsWith('https://')) throw new Error('Public app address unavailable');
    const link = await stripe.accountLinks.create({
      account: account.id, type: 'account_onboarding', collection_options: { fields: 'eventually_due' },
      refresh_url: `${base.replace(/\/$/, '')}/seller/profile/payout?reauth=1`,
      return_url: `${base.replace(/\/$/, '')}/seller/profile/payout?connected=1`,
    });
    return NextResponse.json({ url: link.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
