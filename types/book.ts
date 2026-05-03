import { Timestamp } from 'firebase/firestore';

export interface Book {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerHandle: string;
  sellerVerified: boolean;
  title: string;
  authorName: string;
  description: string;
  coverUrl: string;
  coverBgColor: string;
  coverAccentColor: string;
  genre: string;
  language: string;
  targetAgeGroup: 'all' | 'children' | 'teen' | 'adult';
  isbn: string | null;
  price: number;
  status: 'draft' | 'in_review' | 'live' | 'flagged' | 'removed';
  isFeatured: boolean;
  inSubscription: boolean;
  subscriptionTiers: ('basic' | 'standard' | 'premium')[];
  subscriptionOptInType: 'sell_only' | 'sell_and_sub' | 'sub_only';
  subscriptionEligibleFrom: Timestamp | null;
  previewPercentage: number;
  totalSales: number;
  totalBorrows: number;
  averageRating: number;
  reviewCount: number;
  publishedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  flagReason: string | null;
  flagCount: number;
  readTime: string;
  wordCount: number;
  chapterCount: number;
  tags: string[];
  coAuthors?: { name: string; email: string; revenueShare: number }[];
  isPreorder?: boolean;
  releaseDate?: Timestamp | null;
}

export interface Chapter {
  id: string;
  bookId: string;
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  isPreview: boolean;
  isLocked: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const GENRES = [
  'Fiction',
  'Science',
  'History',
  'Fantasy',
  'Romance',
  'Biography',
  'Self-Help',
  'Business',
  'Poetry',
  'Other',
] as const;

export type Genre = (typeof GENRES)[number];
