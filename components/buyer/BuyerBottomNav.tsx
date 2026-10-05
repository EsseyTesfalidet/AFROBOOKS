'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import './buyer-chrome.css';
import {
  BUYER_MOBILE_TABS,
  BUYER_APP_TABS,
  getBuyerRouteState,
  isBuyerNavActive,
} from '@/components/buyer/buyerNavigation';

export default function BuyerBottomNav() {
  const pathname = usePathname();
  const installed = useInstalledApp();
  const cartCount = useCartStore((state) => state.items.length);
  const openDrawer = useBuyerDrawerStore((state) => state.open);
  const drawerOpen = useBuyerDrawerStore((state) => state.isOpen);
  const routeState = getBuyerRouteState(pathname);

  if (!routeState.showBottomNav) {
    return null;
  }

  return (
    <nav aria-label="Reader navigation" className="buyer-bottom-nav sm:hidden fixed inset-x-0 bottom-3 z-50 px-3">
      <div
        className="buyer-bottom-nav-shell mx-auto max-w-md rounded-[24px] p-2"
      >
        <div className={`grid ${installed ? 'grid-cols-4' : 'grid-cols-5'} gap-1`}>
          {(installed ? BUYER_APP_TABS : BUYER_MOBILE_TABS).map((item) => {
            const { label, href, icon: Icon, drawerSection } = item;
            const active =
              label === 'Profile'
                ? pathname.startsWith('/profile')
                : isBuyerNavActive(pathname, item);

            const content = (
              <>
                <div
                  className="buyer-nav-icon relative flex h-10 w-10 items-center justify-center rounded-2xl"
                >
                  <Icon size={19} aria-hidden="true" />
                  {label === 'Cart' && cartCount > 0 ? (
                    <span
                      className="buyer-cart-count"
                    >
                      {cartCount > 9 ? '9+' : cartCount}
                    </span>
                  ) : null}
                </div>
                <span
                  className="text-[10px] font-medium"
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
                  aria-current={active ? 'page' : undefined}
                  data-active={active}
                  className="buyer-nav-item flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl"
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={label}
                type="button"
                data-active={active}
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                onClick={() => openDrawer(drawerSection)}
                className="buyer-nav-item flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl"
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
