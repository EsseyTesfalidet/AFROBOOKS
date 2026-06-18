'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import {
  BUYER_MOBILE_TABS,
  getBuyerRouteState,
  isBuyerNavActive,
} from '@/components/buyer/buyerNavigation';

export default function BuyerBottomNav() {
  const pathname = usePathname();
  const cartCount = useCartStore((state) => state.items.length);
  const openDrawer = useBuyerDrawerStore((state) => state.open);
  const drawerOpen = useBuyerDrawerStore((state) => state.isOpen);
  const routeState = getBuyerRouteState(pathname);

  if (!routeState.showBottomNav || drawerOpen) {
    return null;
  }

  return (
    <nav className="sm:hidden fixed inset-x-0 bottom-3 z-50 px-3">
      <div
        className="mx-auto max-w-md rounded-[26px] border p-2 shadow-2xl"
        style={{
          background: 'rgba(17,17,17,0.94)',
          borderColor: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.42)',
        }}
      >
        <div className="grid grid-cols-5 gap-1">
          {BUYER_MOBILE_TABS.map((item) => {
            const { label, href, icon: Icon, drawerSection } = item;
            const active =
              label === 'Profile'
                ? pathname.startsWith('/profile')
                : isBuyerNavActive(pathname, item);

            const content = (
              <>
                <div
                  className="relative flex h-10 w-10 items-center justify-center rounded-2xl transition-all"
                  style={{
                    background: active ? 'linear-gradient(180deg, #f05b43 0%, #e8442a 100%)' : 'transparent',
                    color: active ? '#fff' : '#7b7b7b',
                  }}
                >
                  <Icon size={18} />
                  {label === 'Cart' && cartCount > 0 ? (
                    <span
                      className="absolute -right-1 -top-1 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold"
                      style={{ background: '#f5b800', color: '#000', lineHeight: '18px' }}
                    >
                      {cartCount > 9 ? '9+' : cartCount}
                    </span>
                  ) : null}
                </div>
                <span
                  className="text-[10px] font-medium transition-colors"
                  style={{ color: active ? '#f5f2eb' : '#666' }}
                >
                  {label}
                </span>
              </>
            );

            if (href) {
              return (
                <Link
                  key={label}
                  href={href}
                  className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl"
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={label}
                type="button"
                onClick={() => openDrawer(drawerSection)}
                className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl"
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
