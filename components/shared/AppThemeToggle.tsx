'use client';

import { Moon, Sun, Sunrise } from 'lucide-react';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { useAppAppearanceStore } from '@/store/appAppearanceStore';
import { appHaptic } from '@/lib/app/haptics';

export default function AppThemeToggle() {
  const installed = useInstalledApp();
  const { themeMode, setThemeMode } = useAppAppearanceStore();
  if (!installed) return null;
  const label = { auto: 'Auto', light: 'Light', dark: 'Dark' }[themeMode];
  const next = themeMode === 'auto' ? 'light' : themeMode === 'light' ? 'dark' : 'auto';
  const Icon = themeMode === 'auto' ? Sunrise : themeMode === 'light' ? Sun : Moon;
  return <button type="button" className="app-theme-toggle" aria-label={`App theme: ${label}. Switch to ${next}.`}
    title={themeMode === 'auto' ? 'Auto: light 6am–6pm, dark 6pm–6am' : `${label} theme`}
    onClick={() => { setThemeMode(next); appHaptic(); }}><Icon size={16} aria-hidden="true" /><span>{label}</span></button>;
}
