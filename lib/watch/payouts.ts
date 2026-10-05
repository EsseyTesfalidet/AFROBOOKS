export interface VideoPayout {
  id: string; creatorId: string; period: string; currency: string; amountNanos: string;
  status: 'reserved' | 'processing' | 'paid' | 'needs_review' | 'cancelled';
  transferId: string | null; notice: string | null; createdAt: number;
}
export interface VideoFunding {
  id: string; period: string; currency: string; creditedMinor: number; reservedMinor: number; spentMinor: number;
}
export interface VideoPayoutOverview { payouts: VideoPayout[]; funding: VideoFunding[]; stripeReady: boolean }
