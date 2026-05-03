import { Timestamp } from 'firebase/firestore';

export interface Subscription {
  id: string;
  userId: string;
  userDisplayName: string;
  plan: 'basic' | 'standard' | 'premium';
  price: number;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: 'active' | 'cancelled' | 'past_due';
  startDate: Timestamp;
  currentPeriodStart: Timestamp;
  currentPeriodEnd: Timestamp;
  cancelAtPeriodEnd: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PlatformSettings {
  id: 'global';
  directSaleFee: number;
  subscriptionPlatformCut: number;
  borrowRatePerRead: number;
  newBookExclusivityDays: number;
  autoApproveBooks: boolean;
  newUserSignupsOpen: boolean;
  newSellerSignupsOpen: boolean;
  subscriptionSalesActive: boolean;
  maintenanceMode: boolean;
  subscriptionPrices: {
    basic: number;
    standard: number;
    premium: number;
  };
}

export const PLAN_PRICES = {
  basic: 499,
  standard: 999,
  premium: 1499,
} as const;

export const PLAN_LABELS = {
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
} as const;
