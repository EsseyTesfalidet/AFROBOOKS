export const AUDIO_CATEGORIES = ['Music', 'Podcasts', 'Audiobooks'] as const;
export type AudioCategory = typeof AUDIO_CATEGORIES[number];
export interface AudioTitle {
  id: string; creatorId: string; creatorName: string; title: string; description: string;
  category: AudioCategory; language: string; status: 'draft' | 'in_review' | 'published' | 'removed';
  durationSeconds: number; priceCents: number; musicSubscription: boolean; ready: boolean; updatedAt: number; reviewNote: string;
}
export interface AudioEntry { title: AudioTitle; saved: boolean; seconds: number; owned?: boolean }
