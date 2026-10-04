'use client';

import { useInstalledApp } from './useInstalledApp';
import { useAppTheme } from './useAppTheme';
import { useReaderStore, type ReaderTheme } from '@/store/readerStore';

export function useReaderTheme(): ReaderTheme {
  const installed = useInstalledApp();
  const appTheme = useAppTheme();
  const { theme, themeExplicit } = useReaderStore();
  return installed && !themeExplicit ? (appTheme === 'dark' ? 'night' : 'paper') : theme;
}
