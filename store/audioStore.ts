'use client';
import { create } from 'zustand';
import type { AudioTitle } from '@/types/audio';
export interface AudioPlayback { title: AudioTitle; url: string; expiresAt: number; seconds: number; sessionId?: string | null; preview?: boolean; partId?: string; partStartSeconds?: number; expanded?: boolean; rate?: number; volume?: number }
export interface QueueTitle { id: string; title: string; creator: string }
export interface PreviousAudioTitle { id: string; title: string; creator: string; seconds: number }
export type SleepTimer = { mode: 'time'; deadline: number } | { mode: 'chapter'; titleId: string; position: number } | null;
interface AudioState {
  playback: AudioPlayback | null; uid: string; queue: QueueTitle[]; sleep: SleepTimer; previousTitle: PreviousAudioTitle | null;
  set: (playback: AudioPlayback, uid: string, options?: { preservePrevious?: boolean }) => void; setPreviousTitle: (title: PreviousAudioTitle | null) => void; close: () => void;
  enqueue: (item: QueueTitle, uid: string, next?: boolean) => void;
  replaceQueue: (items: QueueTitle[], uid: string) => void;
  removeQueued: (index: number) => void; moveQueued: (index: number, direction: number) => void;
  setSleep: (sleep: SleepTimer) => void;
}
export const useAudioStore = create<AudioState>(set => ({
  playback: null, uid: '', queue: [], sleep: null, previousTitle: null,
  set: (playback, uid, options) => set(state => ({ playback, uid, previousTitle: options?.preservePrevious && state.uid === uid ? state.previousTitle : null, ...(state.uid !== uid ? { queue: [], sleep: null } : {}), ...(state.sleep?.mode === 'chapter' && state.sleep.titleId !== playback.title.id ? { sleep:null } : {}) })),
  setPreviousTitle: previousTitle => set({ previousTitle }),
  close: () => set({ playback: null, uid: '', queue: [], sleep: null, previousTitle: null }),
  enqueue: (item, uid, next = false) => set(state => {
    const queue = state.uid === uid ? state.queue.filter(value => value.id !== item.id) : [];
    return { uid, queue: (next ? [item,...queue] : [...queue,item]).slice(0,100), ...(state.uid !== uid ? { playback:null, sleep:null, previousTitle:null } : {}) };
  }),
  replaceQueue: (queue, uid) => set(state => ({ uid, queue:queue.slice(0,100), ...(state.uid !== uid ? { playback:null, sleep:null, previousTitle:null } : {}) })),
  removeQueued: index => set(state => ({ queue:state.queue.filter((_,i) => i !== index) })),
  moveQueued: (index,direction) => set(state => { const queue=[...state.queue];const target=index+direction;if(index>=0&&target>=0&&index<queue.length&&target<queue.length)[queue[index],queue[target]]=[queue[target],queue[index]];return {queue}; }),
  setSleep: sleep => set({sleep}),
}));
