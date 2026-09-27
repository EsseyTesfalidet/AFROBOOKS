import type Stripe from 'stripe';
import type StripeConnect from 'stripe-connect';

export function connectFixture() {
  const state = {
    accounts: [] as { id: string; metadata: { userId: string }; version: 'v1' | 'v2' }[],
    creates: [] as { params: StripeConnect.V2.Core.AccountCreateParams; key?: string }[],
    links: [] as unknown[],
    configurations: ['recipient'] as string[],
    createError: undefined as unknown,
    legacyListError: undefined as unknown,
    ownerOverride: undefined as string | undefined,
  };
  const stripe = {
    countrySpecs: {
      retrieve: async (country: string) => {
        if (!['US', 'CA'].includes(country)) throw { code: 'resource_missing' };
        return { id: country };
      },
    },
    accounts: {
      list: async function* () {
        if (state.legacyListError) throw state.legacyListError;
        // The legacy endpoint also projects Accounts v2 accounts.
        yield* state.accounts;
      },
      retrieve: async (id: string) => {
        const found = state.accounts.find((item) => item.id === id);
        if (!found) throw { code: 'resource_missing' };
        return { ...found, metadata: { userId: state.ownerOverride ?? found.metadata.userId } };
      },
    },
    accountLinks: {
      create: async (params: unknown) => {
        state.links.push(params);
        return { url: 'https://connect.stripe.com/setup/fixture' };
      },
    },
  } as unknown as Stripe;
  const connect = {
    v2: {
      core: {
        accounts: {
          list: async function* () {
            yield* state.accounts.filter((item) => item.version === 'v2');
          },
          retrieve: async () => ({ applied_configurations: state.configurations }),
          create: async (
            params: StripeConnect.V2.Core.AccountCreateParams,
            options: { idempotencyKey?: string },
          ) => {
            state.creates.push({ params, key: options.idempotencyKey });
            if (state.createError) {
              const error = state.createError;
              state.createError = undefined;
              throw error;
            }
            const account = {
              id: 'acct_created',
              metadata: { userId: String(params.metadata!.userId) },
              version: 'v2' as const,
            };
            state.accounts.push(account);
            return account;
          },
        },
        accountLinks: {
          create: async (params: unknown) => {
            state.links.push(params);
            return { url: 'https://connect.stripe.com/setup/fixture' };
          },
        },
      },
    },
  } as unknown as StripeConnect;
  return { stripe, connect, state };
}
