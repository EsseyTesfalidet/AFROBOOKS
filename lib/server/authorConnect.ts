import type Stripe from 'stripe';
import type StripeConnect from 'stripe-connect';
import type { Firestore } from 'firebase-admin/firestore';

export class AuthorConnectError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 409,
  ) {
    super(message);
  }
}

export function authorAccountParameters(
  uid: string,
  email: string | null,
  country: string,
  cardPayments = false,
): StripeConnect.V2.Core.AccountCreateParams {
  return {
    ...(email ? { contact_email: email } : {}),
    dashboard: 'express',
    identity: { country },
    configuration: {
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      ...(cardPayments
        ? { merchant: { capabilities: { card_payments: { requested: true } } } }
        : {}),
    },
    defaults: {
      responsibilities: { fees_collector: 'application', losses_collector: 'application' },
      profile: { product_description: 'Book author receiving royalties from AfroBooks' },
    },
    metadata: { userId: uid, integration: 'afrobooks-author-v2' },
  };
}

export function requiresCardPaymentsForTransfers(error: unknown) {
  const value = error as { code?: string; param?: string; message?: string };
  return (
    [
      'capability_not_available_without_other_capability',
      'capability_not_available_without_other_capability_in_country',
    ].includes(value?.code ?? '') &&
    value?.param?.includes('stripe_transfers') === true &&
    value?.message?.includes('configuration.merchant.capabilities.card_payments') === true
  );
}

export async function createAuthorAccount(
  connect: StripeConnect,
  uid: string,
  email: string | null,
  country: string,
) {
  try {
    return await connect.v2.core.accounts.create(authorAccountParameters(uid, email, country), {
      idempotencyKey: `afrobooks-author-v2-${uid}`,
    });
  } catch (error) {
    // Stripe requires card-payments eligibility alongside transfers in certain
    // countries (for example Canada). Retry only that definitive validation
    // rejection, never a timeout or unknown creation result.
    if (!requiresCardPaymentsForTransfers(error)) throw error;
    return connect.v2.core.accounts.create(authorAccountParameters(uid, email, country, true), {
      idempotencyKey: `afrobooks-author-v2-merchant-${uid}`,
    });
  }
}

export async function findOrCreateAuthorAccount(
  db: Firestore,
  stripe: Stripe,
  connect: StripeConnect,
  user: { uid: string; email: string | null },
  country?: string,
) {
  const ref = db.doc(`sellers/${user.uid}`);
  const seller = (await ref.get()).data();
  if (!seller)
    throw new AuthorConnectError('An author account is required.', 'author_required', 403);
  if (seller.stripeAccountId) {
    const account = await stripe.accounts.retrieve(seller.stripeAccountId);
    if (account.metadata?.userId !== user.uid)
      throw new AuthorConnectError(
        'This Stripe account needs an ownership review. Contact AfroBooks support.',
        'account_review',
      );
    return {
      account,
      version: seller.stripeAccountApiVersion === 'v2' ? ('v2' as const) : ('v1' as const),
    };
  }
  let recovered: { id: string; version: 'v1' | 'v2' } | undefined;
  function match(id: string, version: 'v1' | 'v2') {
    if (recovered && recovered.id !== id)
      throw new AuthorConnectError(
        'Multiple Stripe accounts need review. Contact AfroBooks support.',
        'account_review',
      );
    if (!recovered || version === 'v2') recovered = { id, version };
  }
  // Recovery precedes creation, so a lost Stripe response or failed Firestore
  // write cannot strand an account. v1 and v2 listings can contain the same ID.
  for await (const candidate of connect.v2.core.accounts.list({ limit: 20 })) {
    if (candidate.metadata?.userId === user.uid) match(candidate.id, 'v2');
  }
  for await (const candidate of stripe.accounts.list({ limit: 100 })) {
    if (candidate.metadata?.userId === user.uid) match(candidate.id, 'v1');
  }
  if (!recovered) {
    if (!country || !/^[A-Z]{2}$/.test(country))
      throw new AuthorConnectError(
        'Choose the country where you live or where your business is registered.',
        'country_required',
        400,
      );
    // Validate against Stripe's current country specifications. Stripe also
    // enforces platform-specific capability and cross-border eligibility.
    try {
      await stripe.countrySpecs.retrieve(country);
    } catch (error) {
      if ((error as { code?: string }).code === 'resource_missing')
        throw new AuthorConnectError(
          'Choose a country supported by Stripe.',
          'country_unavailable',
          400,
        );
      throw error;
    }
    const created = await createAuthorAccount(connect, user.uid, user.email, country);
    recovered = { id: created.id, version: 'v2' };
  }
  const linked = recovered;
  const account = await stripe.accounts.retrieve(linked.id);
  if (account.metadata?.userId !== user.uid)
    throw new AuthorConnectError(
      'This Stripe account needs an ownership review. Contact AfroBooks support.',
      'account_review',
    );
  await db.runTransaction(async (tx) => {
    const latest = await tx.get(ref);
    if (
      !latest.exists ||
      (latest.data()?.stripeAccountId && latest.data()?.stripeAccountId !== account.id)
    )
      throw new AuthorConnectError(
        'Your Stripe account changed. Refresh before trying again.',
        'account_changed',
      );
    tx.update(ref, {
      stripeAccountId: account.id,
      stripeAccountApiVersion: linked.version,
      updatedAt: new Date(),
    });
  });
  return { account, version: linked.version };
}

export async function authorOnboardingLink(
  stripe: Stripe,
  connect: StripeConnect,
  id: string,
  version: 'v1' | 'v2',
  base: string,
) {
  const origin = new URL(base);
  if (origin.protocol !== 'https:')
    throw new AuthorConnectError(
      'Payout setup requires a secure app address. Contact support.',
      'platform_configuration',
      503,
    );
  const refresh = `${origin.origin}/dashboard?profile=payout&stripe=refresh`;
  const returned = `${origin.origin}/dashboard?profile=payout&stripe=returned`;
  if (version === 'v2') {
    const account = await connect.v2.core.accounts.retrieve(id);
    const configurations = (account.applied_configurations ?? []).filter(
      (value): value is 'merchant' | 'recipient' => value === 'merchant' || value === 'recipient',
    );
    if (!configurations.includes('recipient'))
      throw new AuthorConnectError(
        'This Stripe account needs a payout configuration review. Contact support.',
        'account_review',
      );
    return (
      await connect.v2.core.accountLinks.create({
        account: id,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations,
            collection_options: { fields: 'eventually_due' },
            refresh_url: refresh,
            return_url: returned,
          },
        },
      })
    ).url;
  }
  return (
    await stripe.accountLinks.create({
      account: id,
      type: 'account_onboarding',
      collection_options: { fields: 'eventually_due' },
      refresh_url: refresh,
      return_url: returned,
    })
  ).url;
}

export function authorConnectFailure(error: unknown) {
  const value = error as {
    message?: string;
    code?: string;
    type?: string;
    requestId?: string;
    statusCode?: number;
    param?: string;
  };
  const code = value?.code ?? '';
  if (error instanceof AuthorConnectError)
    return { status: error.status, code: error.code, error: error.message };
  if (value?.message === 'Unauthorized' || code.startsWith('auth/'))
    return {
      status: 401,
      code: 'sign_in_required',
      error: 'Please sign in again to connect Stripe.',
    };
  if (value?.message === 'Author account required')
    return { status: 403, code: 'author_required', error: 'An author account is required.' };
  if (
    /platform|activation|liability|losses_collector|requirement_collection|accounts_v2_access|connect_identity|connect_profile/.test(
      code,
    ) ||
    /Accounts v1|signed up for Connect/i.test(value?.message ?? '')
  )
    return {
      status: 503,
      code: 'platform_configuration',
      error:
        'AfroBooks needs to finish its Stripe Connect setup before authors can join. Please contact support.',
    };
  if (/country|cross_border|capability_not_available/.test(code))
    return {
      status: 400,
      code: 'country_unavailable',
      error:
        'Stripe cannot enable author payouts for this country with the current platform settings. Contact AfroBooks support.',
    };
  if (
    code === 'resource_missing' ||
    code === 'account_invalid' ||
    value?.message === 'Stripe account ownership mismatch'
  )
    return {
      status: 409,
      code: 'account_review',
      error:
        'Your Stripe account needs review. Contact AfroBooks support; do not create another account.',
    };
  if (/email/.test(code))
    return {
      status: 400,
      code: 'email_invalid',
      error: 'Check your account email address before connecting Stripe.',
    };
  if (
    value?.type === 'StripeAuthenticationError' ||
    value?.type === 'StripePermissionError' ||
    value?.message === 'Payments are not configured.'
  )
    return {
      status: 503,
      code: 'platform_configuration',
      error: 'AfroBooks cannot access Stripe Connect right now. Please contact support.',
    };
  return {
    status: 503,
    code: 'connect_unavailable',
    error: 'Stripe payout setup could not finish. Please try again or contact AfroBooks support.',
  };
}
