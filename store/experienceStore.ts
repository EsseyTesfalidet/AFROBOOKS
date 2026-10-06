'use client';
import { create } from 'zustand';
import { authenticatedGet, authenticatedPost } from '@/lib/firebase/request';
import { useAuthStore } from './authStore';
import type { ExperiencePreferences } from '@/types/experience';
export const useExperienceStore = create<ExperiencePreferences & { uid: string; loaded: boolean; busy: boolean; error: string }>(() => ({ uid: '', loaded: false, busy: false, error: '', languages: [], playlists: [] }));
export async function loadExperience(uid: string) {
  const current = useExperienceStore.getState();
  if (current.uid === uid && (current.loaded || current.busy)) return;
  useExperienceStore.setState({ uid, loaded: false, busy: true, error: '', languages: [], playlists: [] });
  try { const value = await authenticatedGet<ExperiencePreferences>('/api/experience'); if (useAuthStore.getState().firebaseUser?.uid === uid) useExperienceStore.setState({ languages: value.languages || [], playlists: value.playlists || [], loaded: true }); }
  catch (failure) { if (useExperienceStore.getState().uid === uid) useExperienceStore.setState({ error: (failure as Error).message }); }
  finally { if (useExperienceStore.getState().uid === uid) useExperienceStore.setState({ busy: false }); }
}
export async function updateExperience(action: string, data: unknown) {
  const uid = useAuthStore.getState().firebaseUser?.uid;
  if (!uid || useExperienceStore.getState().busy) throw new Error('Please wait and try again.');
  useExperienceStore.setState({ busy: true, error: '' });
  try { const value = await authenticatedPost<ExperiencePreferences>('/api/experience', { action, data }); if (useAuthStore.getState().firebaseUser?.uid === uid) useExperienceStore.setState({ ...value, uid, loaded: true }); }
  finally { if (useExperienceStore.getState().uid === uid) useExperienceStore.setState({ busy: false }); }
}
