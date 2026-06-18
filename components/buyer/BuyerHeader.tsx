'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Search, ShoppingCart } from 'lucide-react';

import Logo from '@/components/shared/Logo';
import NotificationBell from '@/components/notifications/NotificationBell';
import InstallPWA from '@/components/shared/InstallPWA';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import {
  BUYER_DESKTOP_LINKS,
  getBuyerRouteState,
  isBuyerNavActive,
} from '@/components/buyer/buyerNavigation';

export default function BuyerHeader() {
  const pathname = usePathname();
  const cartCount = useCartStore((s) => s.items.length);
  const userProfile = useAuthStore((s) => s.userProfile);
  const openDrawer = useBuyerDrawerStore((s) => s.open);
  const routeState = getBuyerRouteState(pathname);

  const initials = userProfile
    ? `${userProfile.firstName[0] ?? ''}${userProfile.lastName[0] ?? ''}`.toUpperCase()
    : '?';

  const isProfileActive = pathname.startsWith('/profile');

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: 'rgba(14,14,14,0.88)',
        borderColor: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <div className="mx-auto max-w-5xl px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden sm:block">
              <Logo href="/browse" size="sm" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em]" style={{ color: '#666' }}>
                {routeState.eyebrow}
              </p>
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-white sm:text-base">
                  {routeState.title}
                </p>
                {pathname.startsWith('/cart') || pathname.startsWith('/checkout') ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: '#1f0e0c', color: '#e8442a' }}
                  >
                    {cartCount} item{cartCount === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              <p className="hidden max-w-xl truncate text-xs sm:block" style={{ color: '#666' }}>
                {routeState.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <InstallPWA />
            <Link
              href="/search"
              className="flex h-9 w-9 items-center justify-center rounded-xl border transition-colors"
              style={{ borderColor: '#2a2a2a', color: '#9a9a9a', background: '#151515' }}
              title="Search"
            >
              <Search size={16} />
            </Link>
            <Link
              href="/cart"
              className="relative hidden h-9 w-9 items-center justify-center rounded-xl border transition-colors sm:flex"
              style={{ borderColor: '#2a2a2a', color: '#9a9a9a', background: '#151515' }}
              title="Cart"
            >
              <ShoppingCart size={16} />
              {cartCount > 0 ? (
                <span
                  className="absolute -right-1 -top-1 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold"
                  style={{ background: '#f5b800', color: '#000', lineHeight: '18px' }}
                >
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              ) : null}
            </Link>
            <NotificationBell />
            <button
              type="button"
              onClick={() => openDrawer('account')}
              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border font-display text-sm"
              style={{
                background: isProfileActive ? '#e8442a' : '#151515',
                color: '#fff',
                borderColor: isProfileActive ? '#e8442a' : '#2a2a2a',
              }}
            >
              {userProfile?.avatarUrl ? (
                <img src={userProfile.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </button>
          </div>
        </div>

        <nav className="mt-3 hidden items-center gap-2 sm:flex">
          {BUYER_DESKTOP_LINKS.map(({ label, href, icon: Icon, matches }) => {
            const active = isBuyerNavActive(pathname, { label, href, icon: Icon, matches });
            const isCart = href === '/cart';
            return (
              <Link
                key={href}
                href={href!}
                className="relative inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium transition-all"
                style={{
                  background: active ? 'linear-gradient(180deg, #f05b43 0%, #e8442a 100%)' : '#151515',
                  color: active ? '#fff' : '#999',
                  border: `1px solid ${active ? '#e8442a' : '#242424'}`,
                }}
              >
                <Icon size={15} />
                <span>{label}</span>
                {isCart && cartCount > 0 ? (
                  <span
                    className="rounded-full px-1.5 text-[10px] font-bold"
                    style={{
                      background: active ? 'rgba(255,255,255,0.18)' : '#f5b800',
                      color: active ? '#fff' : '#000',
                    }}
                  >
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => openDrawer('account')}
            className="inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium transition-all"
            style={{
              background: isProfileActive ? 'linear-gradient(180deg, #f05b43 0%, #e8442a 100%)' : '#151515',
              color: isProfileActive ? '#fff' : '#999',
              border: `1px solid ${isProfileActive ? '#e8442a' : '#242424'}`,
            }}
          >
            <span>Profile</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
