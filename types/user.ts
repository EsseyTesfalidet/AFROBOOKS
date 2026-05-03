import { Timestamp } from 'firebase/firestore';

export interface User {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  phone: string;
  country: string;
  dateOfBirth: string;
  role: 'buyer' | 'seller' | 'both' | 'admin';
  activeRole: 'buyer' | 'seller';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: 'active' | 'warned' | 'suspended' | 'banned';
  stripeCustomerId: string | null;
  referralCode: string;
  referredBy: string | null;
  referralCredits: number;
  subscriptionId: string | null;
  subscriptionPlan: 'none' | 'basic' | 'standard' | 'premium';
  subscriptionStatus: 'active' | 'cancelled' | 'past_due' | 'none';
  notificationPreferences: {
    purchaseConfirmations: boolean;
    readingReminders: boolean;
    newChapterAlerts: boolean;
    reviewReplies: boolean;
    flashSales: boolean;
    recommendations: boolean;
    emailReceipts: boolean;
    weeklyDigest: boolean;
    promotionalEmails: boolean;
  };
  readerPreferences: {
    fontSize: 'small' | 'medium' | 'large' | 'xlarge';
    theme: 'parchment' | 'dark' | 'white' | 'sepia';
    lineSpacing: 'compact' | 'normal' | 'relaxed';
  };
  favoriteGenre: string;
  language: string;
  currency: string;
}

export interface Seller {
  uid: string;
  penName: string | null;
  website: string;
  socialLinks: {
    twitter: string;
    instagram: string;
    linkedin: string;
    goodreads: string;
  };
  stripeAccountId: string | null;
  stripeAccountStatus: 'not_connected' | 'pending' | 'active';
  isVerified: boolean;
  verificationStatus: {
    emailVerified: boolean;
    bioAdded: boolean;
    firstBookPublished: boolean;
    idVerified: boolean;
    tenSalesReached: boolean;
  };
  taxFormType: 'W-9' | 'W-8BEN' | null;
  taxFormStatus: 'not_submitted' | 'submitted' | 'approved';
  pendingBalance: number;
  totalEarnings: number;
  payoutSchedule: 'monthly' | 'weekly';
  nextPayoutDate: Timestamp;
  followersCount: number;
  totalSales: number;
  averageRating: number;
  createdAt: Timestamp;
}
