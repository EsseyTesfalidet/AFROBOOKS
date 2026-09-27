import type { Promotion, PromotionSettings } from '../types/promotion';

export const PROMOTION_TERMS_VERSION = '2026-09-27';
export const PROMOTION_TERMS =
  'A seven-day placement in Discover, shared with other promoted books. Views, clicks, and sales are not guaranteed. Campaigns require approval and start after approval for free offers, or confirmed payment for paid offers. Removed, changed, or unavailable books stop showing. If a paid campaign stops early, contact support for a refund review. No automatic renewal.';
export const DEFAULT_PROMOTION_SETTINGS: PromotionSettings = {
  enabled: true,
  priceCents: 0,
  durationDays: 7,
};

export function promotionSettings(data?: Record<string, unknown>): PromotionSettings {
  const price = data?.priceCents;
  // A malformed paid rate closes new submissions instead of silently making them free.
  if (
    data &&
    (!Number.isInteger(price) ||
      (price as number) < 0 ||
      (price as number) > 100000 ||
      ((price as number) > 0 && (price as number) < 100))
  )
    return { enabled: false, priceCents: 0, durationDays: 7 };
  return {
    enabled: data ? data.enabled === true : true,
    priceCents: typeof price === 'number' ? price : 0,
    durationDays: 7,
  };
}
export function promotionLabel(item: Pick<Promotion, 'status' | 'endsAt'>, now = Date.now()) {
  if (item.status === 'active' && item.endsAt <= now) return 'Completed';
  return {
    pending: 'In review',
    approved: 'Ready for payment',
    active: 'Running',
    rejected: 'Not approved',
    stopped: 'Stopped',
    needs_review: 'Payment review',
    refunded: 'Refunded',
  }[item.status];
}
export function promotionPrice(cents: number) {
  return cents === 0
    ? 'Free pilot'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
export function promotionIsOpen(item: Promotion, now = Date.now()) {
  return (
    item.status === 'pending' ||
    item.status === 'approved' ||
    item.status === 'needs_review' ||
    (item.status === 'active' && item.endsAt > now)
  );
}
