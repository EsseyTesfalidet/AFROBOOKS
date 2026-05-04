'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSellerDrawerStore } from '@/store/profileDrawerStore';

const ROUTES = ['/dashboard', '/listings', '/analytics'];

export default function SellerSwipeNav() {
  const router = useRouter();
  const pathname = usePathname();
  const openDrawer = useSellerDrawerStore((s) => s.open);

  // Use refs so the listener doesn't need to be re-registered on every change
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const isDrawerOpen = useSellerDrawerStore((s) => s.isOpen);
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

      // Require at least 60px horizontal movement, and more horizontal than vertical
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

      const current = pathnameRef.current;
      const idx = ROUTES.findIndex((r) => current === r || current.startsWith(r + '/'));

      if (dx < 0) {
        // Swipe left → next
        if (idx === ROUTES.length - 1) {
          openDrawer('identity');
        } else if (idx >= 0) {
          router.push(ROUTES[idx + 1]);
        }
      } else {
        // Swipe right → previous
        if (idx > 0) {
          router.push(ROUTES[idx - 1]);
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
