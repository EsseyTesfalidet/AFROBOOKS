import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { APP_APPEARANCE_KEY, isAppThemeMode, type AppThemeMode } from '@/lib/app/appearance';

interface AppAppearance {
  themeMode: AppThemeMode;
  haptics: boolean;
  setThemeMode: (mode: AppThemeMode) => void;
  setHaptics: (enabled: boolean) => void;
}

export const useAppAppearanceStore = create<AppAppearance>()(persist(set => ({
  themeMode: 'auto', haptics: true,
  setThemeMode: themeMode => set({ themeMode }),
  setHaptics: haptics => set({ haptics }),
}), {
  name: APP_APPEARANCE_KEY,
  partialize: ({ themeMode, haptics }) => ({ themeMode, haptics }),
  merge: (saved, current) => {
    const value = saved as Partial<AppAppearance> | null;
    return { ...current, themeMode: isAppThemeMode(value?.themeMode) ? value.themeMode : 'auto', haptics: value?.haptics !== false };
  },
}));
