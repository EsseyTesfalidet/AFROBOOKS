'use client';
import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useBuyerDrawerStore, useSellerDrawerStore } from '@/store/profileDrawerStore';
export default function ProfileLinkHandler({ seller = false }: { seller?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const section = params.get('profile');
  useEffect(() => {
    if (!section) return;
    if (seller && section === 'earnings') { router.replace('/analytics'); return; }
    if (!seller && ['library', 'stats'].includes(section)) { router.replace('/library'); return; }
    const allowed = seller ? ['identity', 'preview', 'verification', 'payout', 'tax', 'earnings', 'security']
      : ['account', 'settings', 'security', 'stats', 'library', 'wishlist', 'reviews', 'history', 'preferences', 'privacy'];
    const store = seller ? useSellerDrawerStore : useBuyerDrawerStore;
    store.getState().open(allowed.includes(section) ? section : allowed[0]);
  }, [section, seller, router]);
  return null;
}
