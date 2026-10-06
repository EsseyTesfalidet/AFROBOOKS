'use client';
import { create } from 'zustand';
import type { AudioTitle } from '@/types/audio';
export interface AudioPlayback { title: AudioTitle; url: string; expiresAt: number; seconds: number; sessionId?: string | null }
export const useAudioStore = create<{ playback: AudioPlayback | null; uid: string; set: (playback: AudioPlayback, uid: string) => void; close: () => void }>(set => ({
  playback: null, uid: '', set: (playback, uid) => set({ playback, uid }), close: () => set({ playback: null, uid: '' }),
}));
