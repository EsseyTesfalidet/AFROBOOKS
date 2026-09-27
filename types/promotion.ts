export type PromotionStatus =
  | 'pending'
  | 'approved'
  | 'active'
  | 'rejected'
  | 'stopped'
  | 'needs_review'
  | 'refunded';
export interface PromotionSettings {
  enabled: boolean;
  priceCents: number;
  durationDays: 7;
}
export interface Promotion {
  id: string;
  sellerId: string;
  bookId: string;
  status: PromotionStatus;
  priceCents: number;
  durationDays: 7;
  currency: 'usd';
  createdAt: number;
  startsAt: number;
  endsAt: number;
  servingUntil: number;
  views: number;
  clicks: number;
  note: string;
  paidAt: number;
  paymentIntentId?: string;
  checkoutSessionId?: string;
  checkoutAttemptAt?: number;
  checkoutExpiresAt?: number;
  creativeHash: string;
  deliveryIssue?: string;
}
export interface PromotionBook {
  id: string;
  title: string;
  authorName: string;
  coverUrl: string;
  coverBgColor: string;
  coverAccentColor: string;
  status: string;
}
export interface PromotionWorkspace {
  campaigns: Promotion[];
  books: PromotionBook[];
  settings: PromotionSettings;
  paymentsReady: boolean;
  hasMore: boolean;
  nextCursor: string | null;
}
