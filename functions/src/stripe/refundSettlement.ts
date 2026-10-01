/** Written only after the server verifies the refund and absence of author transfers. */
export function isSettledRefund(order: Record<string, unknown>): boolean {
  return order.status === 'refunded' && order.refundStatus === 'full' &&
    order.refundRoyaltyStatus === 'settled_no_transfer';
}
