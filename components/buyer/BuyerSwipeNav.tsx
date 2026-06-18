'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import { BUYER_SWIPE_ROUTES } from '@/components/buyer/buyerNavigation';

export default function BuyerSwipeNav() {
  const router = useRouter();
  const pathname = usePathname();
  const openDrawer = useBuyerDrawerStore((s) => s.open);

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const isDrawerOpen = useBuyerDrawerStore((s) => s.isOpen);
  const drawerRef = useRef(isDrawerOpen);
  drawerRef.current = isDrawerOpen;

  const startX = useRef(0);
  const startY = useRef(0);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    }

    function onTouchEnd(e: TouchEvent) {
      if (drawerRef.current) return;

      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;

      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

      const current = pathnameRef.current;
      const idx = BUYER_SWIPE_ROUTES.findIndex(
        (route) => current === route || current.startsWith(route + '/')
      );

      if (dx < 0) {
        // Swipe left → next
        if (idx === BUYER_SWIPE_ROUTES.length - 1) {
          openDrawer('account');
        } else if (idx >= 0) {
          router.push(BUYER_SWIPE_ROUTES[idx + 1]);
        }
      } else {
        // Swipe right → previous
        if (idx > 0) {
          router.push(BUYER_SWIPE_ROUTES[idx - 1]);
        }
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
