import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeServer } from '@/lib/stripe/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { agreementRequiredResponse } from '@/lib/server/legalAgreement';
import { syncAuthorAccount } from '@/lib/server/authorPayments';
import { getStripeConnectServer } from '@/lib/stripe/connect';
import {
  authorConnectFailure,
  authorOnboardingLink,
  findOrCreateAuthorAccount,
} from '@/lib/server/authorConnect';

async function context(req: NextRequest) {
  const user = await requireRequestUser(req);
  if (!['seller', 'both', 'admin'].includes(user.role)) throw new Error('Author account required');
  const db = await getAdminDb();
  const sellerRef = db.doc(`sellers/${user.uid}`);
  const seller = (await sellerRef.get()).data();
  if (!seller) throw new Error('Author account required');
  return { user, db, sellerRef, seller, stripe: getStripeServer() };
}
function failure(error: unknown, stage: string) {
  const result = authorConnectFailure(error);
  const source = error as { code?: string; type?: string; requestId?: string; param?: string };
  const reference = source?.requestId?.match(/^req_[A-Za-z0-9]+$/)?.[0];
  console.error('Stripe author account request failed', {
    stage,
    code: source?.code ?? result.code,
    type: source?.type,
    parameter: source?.param,
    reference,
  });
  return NextResponse.json(
    { error: result.error, code: result.code, ...(reference ? { reference } : {}) },
    { status: result.status, headers: { 'Cache-Control': 'no-store' } },
  );
}

// Refreshes Stripe's actual eligibility; returning from onboarding is not proof
// that an author has completed identity checks or can receive payouts.
export async function GET(req: NextRequest) {
  try {
    const { user, db, seller, stripe } = await context(req);
    const enabled =
      (await db.doc('platformSettings/global').get()).data()?.automatedPayoutsEnabled === true;
    if (!seller.stripeAccountId) {
      const names = new Intl.DisplayNames(['en'], { type: 'region' });
      const countries: { code: string; name: string }[] = [];
      for await (const country of stripe.countrySpecs.list({ limit: 100 }))
        countries.push({ code: country.id, name: names.of(country.id) ?? country.id });
      countries.sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json(
        { connected: false, ready: false, enabled, countries },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const account = await stripe.accounts.retrieve(seller.stripeAccountId);
    const readiness = await syncAuthorAccount(db, user.uid, account);
    let balance: { amount: number; currency: string }[] = [];
    let pendingBalance: { amount: number; currency: string }[] = [];
    let bankPayouts: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      arrivalDate: number;
      failureMessage: string | null;
    }[] = [];
    let historyAvailable = true;
    try {
      const [funds, payouts] = await Promise.all([
        stripe.balance.retrieve({}, { stripeAccount: account.id }),
        stripe.payouts.list({ limit: 10 }, { stripeAccount: account.id }),
      ]);
      balance = funds.available.map((item) => ({ amount: item.amount, currency: item.currency }));
      pendingBalance = funds.pending.map((item) => ({
        amount: item.amount,
        currency: item.currency,
      }));
      bankPayouts = payouts.data.map((item) => ({
        id: item.id,
        amount: item.amount,
        currency: item.currency,
        status: item.status,
        arrivalDate: item.arrival_date,
        failureMessage: item.failure_message,
      }));
    } catch {
      historyAvailable = false;
    }
    return NextResponse.json(
      {
        connected: true,
        ready: readiness.stripeAccountStatus === 'active',
        enabled,
        country: readiness.stripeCountry,
        requirementsDue: readiness.stripeRequirementsDue.length,
        pendingVerification: (account.requirements?.pending_verification?.length ?? 0) > 0,
        payoutHold: !!seller.payoutHoldReason,
        balance,
        pendingBalance,
        bankPayouts,
        historyAvailable,
        schedule: account.settings?.payouts?.schedule?.interval ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error, 'status');
  }
}

const actionSchema = z.object({
  action: z.enum(['onboarding', 'dashboard']).default('onboarding'),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
});
export async function POST(req: NextRequest) {
  let stage = 'authorize';
  try {
    const { user, db, stripe } = await context(req);
    const agreementError = agreementRequiredResponse(user);
    if (agreementError) return agreementError;
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json({ error: 'Invalid payout action.' }, { status: 400 });
    stage = 'find_or_create_account';
    const connect = getStripeConnectServer();
    const { account, version } = await findOrCreateAuthorAccount(
      db,
      stripe,
      connect,
      user,
      parsed.data.country,
    );
    stage = 'sync_readiness';
    const readiness = await syncAuthorAccount(db, user.uid, account);
    if (parsed.data.action === 'dashboard' && readiness.stripeAccountStatus === 'active') {
      stage = 'dashboard_link';
      const link = await stripe.accounts.createLoginLink(account.id);
      return NextResponse.json({ url: link.url }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const base = process.env.NEXT_PUBLIC_APP_URL;
    if (!base || !base.startsWith('https://')) throw new Error('Public app address unavailable');
    stage = 'onboarding_link';
    const url = await authorOnboardingLink(stripe, connect, account.id, version, base);
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error, stage);
  }
}
