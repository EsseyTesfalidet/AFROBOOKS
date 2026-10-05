export const PLAY_PACKAGE = 'com.afrobs.app';
export const PLAY_METHOD = 'https://play.google.com/billing';
export const PLAY_PRODUCT_PATTERN = /^afrobooks_video_[a-z0-9_]{1,100}$/;
export interface PlayOffer {
  productId: string;
  accountId: string;
  testOnly: boolean;
}
export const VIDEO_PLATFORM_BPS = 2000;
export interface VideoEarning {
  id: string;
  videoId: string;
  videoTitle: string;
  creatorId: string;
  orderId: string | null;
  status: 'pending' | 'accrued' | 'refund_pending' | 'reversed';
  currency: string | null;
  googleRevenueNanos: string | null;
  creatorEarningsNanos: string | null;
  platformEarningsNanos: string | null;
  updatedAt: number;
}
export function videoMoney(nanos: string | null, currency: string | null) {
  if (nanos === null || !currency) return 'Awaiting Google';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(nanos) / 1e9);
}
export interface PlayPurchaseResult {
  status: 'active' | 'pending' | 'revoked';
  acknowledged: boolean;
  videoId: string;
}
export function playPrice(item: { price: { currency: string; value: string } }) {
  const amount = Number(item.price.value);
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(item.price.currency)) throw new Error('This video’s Google Play price is unavailable.');
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: item.price.currency }).format(amount);
}
