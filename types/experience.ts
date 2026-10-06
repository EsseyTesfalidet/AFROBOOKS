export type MediaKind = 'book' | 'video' | 'audio';
export interface MediaRef { kind: MediaKind; id: string }
export interface MediaCard extends MediaRef { title: string; creator: string; language: string; cover: string; href: string; progress?: number; updatedAt?: number }
export interface Playlist { id: string; name: string; titleIds: string[] }
export interface ExperiencePreferences { languages: string[]; playlists: Playlist[] }
export interface StoryCollection { id: string; title: string; description: string; published: boolean; items: MediaRef[]; updatedAt: number }
export interface CollectionView extends Omit<StoryCollection, 'items'> { items: MediaCard[] }
