import { Timestamp } from 'firebase/firestore';

export interface Order {
  id: string;
  buyerId: string;
  buyerEmail: string;
  giftId?: string;
  bookId: string;
  bookTitle: string;
  sellerId: string;
  sellerName: string;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
  promoCodeUsed: string | null;
  stripePaymentIntentId: string;
  stripeFee: number;
  platformFee: number;
  sellerEarnings: number;
  platformFeePercent?: number;
  processingFeeBasis?: 'estimated_us_domestic_card';
  pricingVersion?: number;
  status: 'pending' | 'completed' | 'refunded' | 'disputed' | 'needs_review' | 'failed';
  refundStatus?: 'full' | 'partial' | 'pending' | 'failed';
  paymentRefundedAmount?: number;
  receiptEmailSent: boolean;
  createdAt: Timestamp;
}

export interface LibraryItem {
  id: string;
  userId: string;
  bookId: string;
  purchaseType: 'bought' | 'subscription' | 'free_copy';
  orderId: string | null;
  addedAt: Timestamp;
}

export interface WishlistItem {
  id: string;
  userId: string;
  bookId: string;
  addedAt: Timestamp;
}

export interface ReadingProgress {
  id: string;
  userId: string;
  bookId: string;
  currentChapter: number;
  scrollPosition: number;
  scrollFraction?: number;
  positionAnchor?: { block: number; fraction: number } | null;
  positionUpdatedAt?: number;
  percentComplete: number;
  lastReadAt: Timestamp;
  isFinished: boolean;
  finishedAt: Timestamp | null;
}

export interface BorrowRecord {
  id: string;
  userId: string;
  bookId: string;
  sellerId: string;
  subscriptionId: string;
  borrowedAt: Timestamp;
  month: string;
  payoutAmount: number;
  isPaid: boolean;
  paidAt: Timestamp | null;
}

export interface Payout {
  id: string;
  sellerId: string;
  sellerName: string;
  stripeAccountId: string;
  amountCents: number;
  periodLabel: string;
  salesCount: number;
  borrowCount: number;
  salesEarnings: number;
  subscriptionEarnings: number;
  stripeTransferId: string | null;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'needs_review';
  paidAt: Timestamp | null;
  createdAt: Timestamp;
}
