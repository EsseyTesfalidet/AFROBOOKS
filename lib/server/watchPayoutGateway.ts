import Stripe from 'stripe';
import type { ConnectedAccount } from '../../functions/src/stripe/accountReadiness';
import { WatchError } from './watchErrors';

export interface VideoTransfer {
  id: string; amount: number; currency: string; destination: string | { id: string } | null;
  amount_reversed: number; livemode: boolean; metadata: Record<string, string>; transfer_group: string | null;
}
export interface VideoPayoutGateway {
  account(id: string): Promise<ConnectedAccount>;
  funding(id: string): Promise<{ id: string; currency: string; net: number; available: boolean; live: boolean }>;
  available(currency: string): Promise<number>;
  find(group: string): Promise<VideoTransfer[]>;
  retrieve(id: string): Promise<VideoTransfer>;
  transfer(input: { amount: number; currency: string; destination: string; id: string; creatorId: string }): Promise<VideoTransfer>;
}
export function videoPayoutStripeReady() { return /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || ''); }
export function videoPayoutGateway(): VideoPayoutGateway {
  if (!videoPayoutStripeReady()) throw new WatchError(503, 'Live Stripe payouts are not configured.');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10', timeout: 20000, maxNetworkRetries: 1 });
  return {
    account: id => stripe.accounts.retrieve(id),
    funding: async id => {
      const topup = await stripe.topups.retrieve(id, { expand: ['balance_transaction'] });
      const balance = typeof topup.balance_transaction === 'object' ? topup.balance_transaction : null;
      return { id: topup.id, currency: topup.currency.toUpperCase(), net: balance?.net || 0, live: topup.livemode,
        available: topup.status === 'succeeded' && balance?.status === 'available' && balance.currency === topup.currency && balance.available_on <= Math.floor(Date.now() / 1000) };
    },
    available: async currency => (await stripe.balance.retrieve()).available.find(b => b.currency === currency.toLowerCase())?.amount || 0,
    find: async group => {
      const result = await stripe.transfers.list({ transfer_group: group, limit: 2 });
      if (result.has_more) throw new WatchError(409, 'Duplicate video transfers need review.');
      return result.data as VideoTransfer[];
    },
    retrieve: async id => await stripe.transfers.retrieve(id) as VideoTransfer,
    transfer: async input => await stripe.transfers.create({ amount: input.amount, currency: input.currency.toLowerCase(),
      destination: input.destination, transfer_group: `video_${input.id}`,
      metadata: { integration: 'afrobooks-video', videoPayoutId: input.id, creatorId: input.creatorId },
      description: `AfroBooks monthly video earnings ${input.id}`,
    }, { idempotencyKey: `afrobooks-video-${input.id}` }) as VideoTransfer,
  };
}
