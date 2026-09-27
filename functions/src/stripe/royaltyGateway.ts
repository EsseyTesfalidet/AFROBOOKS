import type { RoyaltyGateway, RoyaltyTransfer } from './authorRoyalties';
import type { ConnectedAccount } from './accountReadiness';

interface StripeClient {
  accounts: { retrieve(id: string): Promise<ConnectedAccount> };
  paymentIntents: { retrieve(id: string, params: { expand: string[] }): Promise<{
    id: string; status: string; currency: string; amount_received: number; livemode: boolean;
    metadata: { [key: string]: string }; latest_charge: string | { id: string; paid: boolean; amount_refunded: number; disputed: boolean } | null;
  }> };
  transfers: {
    list(params: { destination: string; limit: number }): AsyncIterable<RoyaltyTransfer>;
    create(params: { amount: number; currency: string; destination: string; source_transaction: string; metadata: Record<string, string>; description: string }, options: { idempotencyKey: string }): Promise<RoyaltyTransfer>;
  };
}

// Only this adapter talks to Stripe; ledger tests use a synthetic gateway.
export function stripeRoyaltyGateway(stripe: StripeClient): RoyaltyGateway {
  return {
    account: id => stripe.accounts.retrieve(id),
    payment: async id => {
      const payment = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
      const charge = typeof payment.latest_charge === 'object' ? payment.latest_charge : null;
      return { id: payment.id, status: payment.status, currency: payment.currency, amount_received: payment.amount_received,
        livemode: payment.livemode, metadata: payment.metadata,
        charge: charge ? { id: charge.id, paid: charge.paid, amount_refunded: charge.amount_refunded, disputed: charge.disputed } : null };
    },
    transfers: async destination => {
      const transfers: RoyaltyTransfer[] = [];
      for await (const transfer of stripe.transfers.list({ destination, limit: 100 })) transfers.push(transfer as RoyaltyTransfer);
      return transfers;
    },
    transfer: async input => await stripe.transfers.create({
      amount: input.amount, currency: 'usd', destination: input.destination,
      source_transaction: input.source,
      metadata: { payoutId: input.payoutId, sellerId: input.sellerId, orderId: input.orderId },
      description: `AfroBooks book royalty ${input.orderId}`,
    }, { idempotencyKey: input.idempotencyKey }) as RoyaltyTransfer,
  };
}
