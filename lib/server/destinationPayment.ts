import type Stripe from 'stripe';

export interface DestinationSettlement {
  accountId: string;
  chargeId: string;
  transferId: string;
  grossAmount: number;
  applicationFeeAmount: number;
}

const id = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;

// Retrieve current Stripe objects, not client values or an old webhook payload.
export async function destinationSettlement(stripe: Stripe, payment: Stripe.PaymentIntent): Promise<DestinationSettlement> {
  const accountId = id(payment.transfer_data?.destination);
  const charge = payment.latest_charge;
  if (!accountId || payment.status !== 'succeeded' || payment.currency !== 'usd' || !charge || typeof charge === 'string' || !charge.paid || charge.disputed || charge.amount_refunded > 0) throw new Error('Destination payment requires review');
  const transferId = id(charge.transfer);
  if (!transferId) throw new Error('Destination transfer not yet available');
  const transfer = await stripe.transfers.retrieve(transferId);
  const feeAmount = payment.application_fee_amount ?? 0;
  if (!Number.isSafeInteger(feeAmount) || feeAmount < 0 || feeAmount > payment.amount_received || transfer.currency !== 'usd' || transfer.amount !== payment.amount_received || id(transfer.destination) !== accountId || id(transfer.source_transaction) !== charge.id || transfer.reversed || transfer.amount_reversed > 0) throw new Error('Destination transfer mismatch');
  if (feeAmount > 0) {
    const feeId = id(charge.application_fee);
    if (!feeId) throw new Error('Application fee not yet available');
    const fee = await stripe.applicationFees.retrieve(feeId);
    if (fee.amount !== feeAmount || fee.currency !== 'usd' || id(fee.account) !== accountId || id(fee.originating_transaction) !== charge.id || fee.refunded || fee.amount_refunded > 0) throw new Error('Application fee mismatch');
  }
  return { accountId, chargeId: charge.id, transferId, grossAmount: transfer.amount, applicationFeeAmount: feeAmount };
}
