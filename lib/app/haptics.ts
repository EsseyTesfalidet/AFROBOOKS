import { isInstalledApp } from './installed';
import { useAppAppearanceStore } from '@/store/appAppearanceStore';

let lastTap = 0;
const completedPurchases = new Set<string>();

export function appHaptic(kind: 'tap' | 'success' = 'tap'): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function' || !isInstalledApp() ||
    !useAppAppearanceStore.getState().haptics || document.visibilityState === 'hidden' ||
    !navigator.maxTouchPoints || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const now = Date.now();
  if (now - lastTap < 80) return false;
  try {
    const accepted = navigator.vibrate(kind === 'success' ? [12, 45, 18] : 8);
    if (accepted) lastTap = now;
    return accepted;
  } catch { return false; }
}

// Call only after the existing receipt flow confirms completed orders.
export function purchaseHapticOnce(receiptKey: string) {
  if (!receiptKey || completedPurchases.has(receiptKey)) return;
  const storageKey = `afrobooks:purchase-feedback:${receiptKey}`;
  try { if (sessionStorage.getItem(storageKey)) return; } catch { /* Optional storage. */ }
  completedPurchases.add(receiptKey);
  if (appHaptic('success')) {
    try { sessionStorage.setItem(storageKey, '1'); } catch { /* Optional storage. */ }
  }
}
