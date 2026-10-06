'use client';
import { useEffect } from 'react';
import { useInstalledApp } from './useInstalledApp';
import { useAuthStore } from '@/store/authStore';
import { loadExperience, useExperienceStore } from '@/store/experienceStore';
const EMPTY: string[] = [];
export function useDiscoveryLanguages() {
  const installed = useInstalledApp(); const uid = useAuthStore(s => s.firebaseUser?.uid); const prefs = useExperienceStore();
  useEffect(() => { if (installed && uid) void loadExperience(uid); }, [installed, uid]);
  return installed && uid === prefs.uid ? prefs.languages : EMPTY;
}
