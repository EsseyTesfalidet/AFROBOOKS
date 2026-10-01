/** Written only after the server verifies full refunds and reconciles royalties. */
export function isSettledRefund(order: Record<string, unknown>): boolean {
  return order.status === 'refunded' && order.refundStatus === 'full' &&
    ['settled_no_transfer', 'settled_reversed_transfer'].includes(String(order.refundRoyaltyStatus));
}

export function isSettledReversal(payout: Record<string, unknown>): boolean {
  return payout.kind === 'book_royalty' && payout.status === 'reversed' && payout.refundSettlement === 'full_reversal';
}
