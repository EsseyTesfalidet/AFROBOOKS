import { Timestamp } from 'firebase/firestore';

export interface Review {
  id: string;
  bookId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerInitials: string;
  reviewerAvatarUrl: string | null;
  isVerifiedPurchase: boolean;
  stars: number;
  title: string;
  body: string;
  helpfulCount: number;
  isReported: boolean;
  reportReason: string | null;
  sellerReply: {
    text: string;
    repliedAt: Timestamp;
  } | null;
  status: 'active' | 'removed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PromoCode {
  id: string;
  sellerId: string;
  code: string;
  discountType: 'percentage' | 'fixed' | 'free';
  discountValue: number;
  applyTo: 'all' | 'specific';
  specificBookId: string | null;
  codeType: 'single' | 'multi' | 'unlimited';
  maxUses: number | null;
  currentUses: number;
  limitOnePerCustomer: boolean;
  startDate: Timestamp;
  expiryDate: Timestamp;
  status: 'active' | 'paused' | 'expired';
  totalRevenue: number;
  createdAt: Timestamp;
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'purchase'
    | 'review_reply'
    | 'new_chapter'
    | 'promo'
    | 'reading_reminder'
    | 'sale'
    | 'payout'
    | 'new_review'
    | 'low_rating'
    | 'milestone'
    | 'follower'
    | 'system';
  title: string;
  message: string;
  isRead: boolean;
  actionUrl: string | null;
  relatedBookId: string | null;
  createdAt: Timestamp;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: 'book' | 'review' | 'user';
  targetId: string;
  targetName: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  adminNote: string | null;
  resolvedBy: string | null;
  resolvedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'maintenance' | 'feature';
  targetAudience: 'all' | 'buyers' | 'sellers';
  isActive: boolean;
  authorId: string;
  authorName: string;
  createdAt: Timestamp | null;
}
