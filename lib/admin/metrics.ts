export function dateValue(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function')
    return value.toDate().getTime();
  return 0;
}
export interface AdminSale {
  status: string;
  finalPrice?: number;
  platformFee?: number;
  sellerEarnings?: number;
  createdAt?: unknown;
}
export function salesSummary(orders: AdminSale[], days: number, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - days + 1);
  const completed = orders.filter(
    (order) =>
      order.status === 'completed' &&
      dateValue(order.createdAt) >= start.getTime() &&
      dateValue(order.createdAt) <= now.getTime(),
  );
  const series = Array.from({ length: days }, (_, index) => {
    const day = new Date(start);
    day.setDate(day.getDate() + index);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const sales = completed.filter(
      (order) =>
        dateValue(order.createdAt) >= day.getTime() && dateValue(order.createdAt) < next.getTime(),
    );
    return {
      date: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      gross: sales.reduce((sum, order) => sum + (order.finalPrice ?? 0), 0),
      platform: sales.reduce((sum, order) => sum + (order.platformFee ?? 0), 0),
      royalties: sales.reduce((sum, order) => sum + (order.sellerEarnings ?? 0), 0),
      count: sales.length,
    };
  });
  return {
    series,
    gross: completed.reduce((sum, order) => sum + (order.finalPrice ?? 0), 0),
    platform: completed.reduce((sum, order) => sum + (order.platformFee ?? 0), 0),
    royalties: completed.reduce((sum, order) => sum + (order.sellerEarnings ?? 0), 0),
    count: completed.length,
  };
}
