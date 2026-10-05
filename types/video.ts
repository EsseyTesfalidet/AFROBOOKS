export const VIDEO_CATEGORIES = ['Films', 'Short films', 'Documentaries', 'Music', 'News & interviews', 'Culture & learning'] as const;
export type VideoCategory = typeof VIDEO_CATEGORIES[number];
export type VideoStatus = 'draft' | 'processing' | 'in_review' | 'published' | 'unlisted' | 'removed';

// Public metadata only. Provider IDs, upload URLs and rights evidence live in
// watchPrivate, which is never serialized into a catalog response.
export interface WatchVideo {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description: string;
  category: VideoCategory;
  language: string;
  priceCents: number;
  currency: 'usd';
  posterUrl: string;
  durationSeconds: number;
  hasTrailer: boolean;
  status: VideoStatus;
  publishedAt: number | null;
  newsDate: string;
  updatedAt: number;
}
export interface WatchState {
  saved: boolean;
  owned: boolean;
  seconds: number;
  following: boolean;
}
export interface WatchCreator {
  uid: string;
  name: string;
  status: 'pending' | 'approved' | 'paused';
  // Reservations count towards this quota even if the creator abandons an
  // upload. Only an admin can increase it; clients cannot release capacity.
  allowanceSeconds: number;
  reservedSeconds: number;
  createdAt: number;
}
export interface WatchAsset {
  uid: string;
  uploadUrl: string;
  expiresAt: number;
  maximumSeconds: number;
  size: number;
  ready: boolean;
  processingState?: string;
  processingPercent?: number | null;
  checkedAt?: number;
  duration: number;
  captions: string[];
}
export interface WatchPrivate {
  pendingRevision?: WatchRevision | null;
  revisionReviewNote?: string;
  creatorRemovedAt?: number;
  processingError?: string;
  playProductId?: string;
  playTestEnabled?: boolean;
  playLiveEnabled?: boolean;
  rightsStatement: string;
  rightsAcceptedAt?: number;
  reviewNote: string;
  fullPending?: boolean;
  trailerPending?: boolean;
  captionsPending?: boolean;
  full?: WatchAsset;
  trailer?: WatchAsset;
}

export interface WatchRevision {
  id: string;
  requestedAt: number;
  draft: Pick<WatchVideo, 'title' | 'description' | 'category' | 'language' | 'priceCents' | 'newsDate'> & { rightsStatement: string; rightsAccepted: true };
}
