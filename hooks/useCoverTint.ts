'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useInstalledApp } from './useInstalledApp';
import { safeCoverColor } from '@/lib/app/appearance';

type Cover = { coverUrl?: string; coverBgColor?: string; coverAccentColor?: string };
const colors = new Map<string, Promise<string | null>>();

function coverColor(url: string) {
  const cached = colors.get(url);
  if (cached) return cached;
  // Only the current book/checkout is sampled, never every cover in the feed.
  const result = import('fast-average-color').then(async ({ FastAverageColor }) => {
    const sampler = new FastAverageColor();
    try {
      const color = await sampler.getColorAsync(url, { algorithm: 'dominant', mode: 'speed', crossOrigin: 'anonymous', silent: true,
        ignoredColor: [[255, 255, 255, 255, 24], [0, 0, 0, 255, 24]] });
      return color.error || color.value[3] === 0 ? null : safeCoverColor(color.hex);
    } catch { return null; }
    finally { sampler.destroy(); }
  }).catch(() => null);
  if (colors.size >= 48) colors.delete(colors.keys().next().value!);
  colors.set(url, result);
  return result;
}

export function useCoverTint(cover?: Cover | null): CSSProperties | undefined {
  const installed = useInstalledApp();
  const url = cover?.coverUrl?.trim() ?? '';
  const fallback = safeCoverColor(cover?.coverBgColor, safeCoverColor(cover?.coverAccentColor));
  const [sample, setSample] = useState<{ url: string; color: string | null } | null>(null);
  useEffect(() => {
    if (!installed || !url) return;
    let active = true;
    void coverColor(url).then(color => { if (active) setSample({ url, color }); });
    return () => { active = false; };
  }, [installed, url]);
  return installed ? { '--book-tint': (sample?.url === url && sample.color) || fallback } as CSSProperties : undefined;
}
