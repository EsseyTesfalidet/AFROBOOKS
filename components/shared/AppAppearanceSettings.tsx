'use client';

import { useInstalledApp } from '@/hooks/useInstalledApp';
import { useAppAppearanceStore } from '@/store/appAppearanceStore';
import { appHaptic } from '@/lib/app/haptics';
import type { AppThemeMode } from '@/lib/app/appearance';

export default function AppAppearanceSettings() {
  const installed = useInstalledApp();
  const { themeMode, setThemeMode, haptics, setHaptics } = useAppAppearanceStore();
  if (!installed) return null;
  return <section className="app-panel space-y-4 border p-5" aria-labelledby="app-appearance-title">
    <h3 id="app-appearance-title" className="font-semibold">App appearance</h3>
    <fieldset><legend className="mb-2 text-sm">Theme</legend><div className="app-theme-choices">
      {(['auto', 'light', 'dark'] as AppThemeMode[]).map(mode => <label key={mode}><input type="radio" name="app-theme" value={mode} checked={themeMode === mode} onChange={() => { setThemeMode(mode); appHaptic(); }} /><span>{mode === 'auto' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark'}</span></label>)}
    </div></fieldset>
    <p className="app-muted text-xs leading-relaxed">Auto uses Light from 6am to 6pm and Dark overnight, in your local time. Your chosen reading theme stays yours.</p>
    <label className="flex min-h-11 items-center justify-between gap-4 text-sm"><span>Touch feedback<small className="app-muted mt-1 block">Light taps on supported phones</small></span><input type="checkbox" role="switch" checked={haptics} onChange={event => { setHaptics(event.target.checked); if (event.target.checked) appHaptic(); }} /></label>
  </section>;
}
