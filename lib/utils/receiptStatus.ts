export function receiptStatus(expectedCount: number, orders: { status: string }[]) {
  if (!expectedCount || orders.length !== expectedCount) return 'processing';
  if (orders.some(order => ['refunded', 'disputed', 'failed', 'needs_review'].includes(order.status))) return 'unavailable';
  return orders.every(order => order.status === 'completed') ? 'completed' : 'processing';
}
