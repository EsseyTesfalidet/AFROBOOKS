import type Stripe from 'stripe';

export interface BookRouting {
  chargeRouting: 'separate' | 'destination';
  destinationAccountId: string | null;
  applicationFeeAmount: number;
}

// IDs and prices are supplied only after server-side book/account validation.
export function bookRouting(accounts: Map<string, string>, total: number, earnings: number, enabled: boolean): BookRouting {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(earnings) || total < 50 || earnings < 0 || earnings > total) throw new Error('Invalid routing amounts');
  if (!enabled || accounts.size !== 1 || earnings === 0) return { chargeRouting: 'separate', destinationAccountId: null, applicationFeeAmount: 0 };
  const destination = [...accounts.values()][0];
  if (!/^acct_[A-Za-z0-9]+$/.test(destination)) throw new Error('Invalid destination account');
  // Stripe debits processing fees from the platform. Retain the existing
  // processing estimate plus commission so the author's quoted earnings agree.
  return { chargeRouting: 'destination', destinationAccountId: destination, applicationFeeAmount: total - earnings };
}

export function routingParameters(routing: BookRouting): Pick<Stripe.PaymentIntentCreateParams, 'transfer_data' | 'application_fee_amount'> {
  if (routing.chargeRouting !== 'destination') return {};
  if (!routing.destinationAccountId || !/^acct_[A-Za-z0-9]+$/.test(routing.destinationAccountId) || !Number.isSafeInteger(routing.applicationFeeAmount) || routing.applicationFeeAmount < 0) throw new Error('Invalid destination routing');
  return { transfer_data: { destination: routing.destinationAccountId }, application_fee_amount: routing.applicationFeeAmount };
}
