import { z } from 'zod';

export const giftCheckoutSchema = z.object({
  recipientEmail: z.string().trim().toLowerCase().email().max(254),
  message: z.string().trim().max(1000).default(''),
  attemptId: z.string().uuid(),
});

export const giftTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export type GiftStatus = 'pending' | 'available' | 'claimed' | 'needs_review';
export interface SentGift {
  id: string;
  bookId: string;
  bookTitle: string;
  recipientEmail: string;
  message: string;
  status: GiftStatus;
  emailStatus: 'pending' | 'sending' | 'sent' | 'failed' | 'needs_review';
  price: number;
  createdAt: number;
  claimedAt: number | null;
  orderId: string;
}

export interface GiftPreview {
  bookId: string;
  bookTitle: string;
  senderName: string;
  message: string;
  claimed: boolean;
}

export interface GiftResume {
  bookId: string;
  price: number;
  attemptId: string;
  recipientEmail: string;
  message: string;
}
