'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Library, ShoppingCart, User, LogOut } from 'lucide-react';

import Logo from '@/components/shared/Logo';
import NotificationBell from '@/components/notifications/NotificationBell';
import InstallPWA from '@/components/shared/InstallPWA';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import { logOut } from '@/lib/firebase/auth';

const NAV_LINKS = [
  { label: 'Browse', href: '/browse', icon: BookOpen },
  { label: 'Library', href: '/library', icon: Library },
  { label: 'Cart', href: '/cart', icon: ShoppingCart },
];

export default function BuyerHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const cartCount = useCartStore((s) => s.items.length);
  const userProfile = useAuthStore((s) => s.userProfile);
  const openDrawer = useBuyerDrawerStore((s) => s.open);

  const initials = userProfile
    ? `${userProfile.firstName[0] ?? ''}${userProfile.lastName[0] ?? ''}`.toUpperCase()
    : '?';

  const isProfileActive = pathname.startsWith('/profile');

  return (
    <>
      {/* Top header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-5 h-14"
        style={{ background: '#0e0e0e', borderBottom: '1px solid #222' }}
      >
        <Logo href="/browse" size="sm" />

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV_LINKS.map(({ label, href }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            const isCart = href === '/cart';
            return (
              <Link key={href} href={href}
                className="relative px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: active ? '#e8442a' : '#fff', color: active ? '#fff' : '#000' }}>
                {label === 'Library' ? 'My Library' : label}
                {isCart && cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full text-xs font-bold"
                    style={{ background: '#e8442a', color: '#fff', fontSize: '10px' }}>
                    {cartCount}
                  </span>
                )}
              </Link>
            );
          })}
          {/* Profile opens drawer */}
          <button type="button" onClick={() => openDrawer('account')}
            className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: isProfileActive ? '#e8442a' : '#fff', color: isProfileActive ? '#fff' : '#000' }}>
            Profile
          </button>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <InstallPWA />
          {/* Sign out button — desktop only, near bell */}
          <button type="button"
            onClick={async () => { await logOut(); router.replace('/login'); }}
            className="hidden sm:block text-xs px-2.5 py-1 rounded-lg border"
            style={{ borderColor: '#333', color: '#888' }}>
            Sign out
          </button>
          {/* Sign-out icon — mobile only, near bell */}
          <button type="button" title="Sign out"
            onClick={async () => { await logOut(); router.replace('/login'); }}
            className="sm:hidden w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: '#888' }}>
            <LogOut size={17} />
          </button>
          <NotificationBell />
          {/* Avatar opens drawer */}
          <button type="button" onClick={() => openDrawer('account')}
            className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-display text-sm flex-shrink-0"
            style={{ background: '#e8442a', color: '#fff' }}>
            {userProfile?.avatarUrl
              ? <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              : initials}
          </button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex"
        style={{ background: '#0e0e0e', borderTop: '1px solid #222', height: 60, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV_LINKS.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          const isCart = href === '/cart';
          return (
            <Link key={href} href={href}
              className="relative flex-1 flex flex-col items-center justify-center gap-1"
              style={{ color: active ? '#e8442a' : '#555' }}>
              <div className="relative">
                <Icon size={22} />
                {isCart && cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 w-4 h-4 flex items-center justify-center rounded-full font-bold"
                    style={{ background: '#e8442a', color: '#fff', fontSize: '9px' }}>
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '10px' }}>{label}</span>
            </Link>
          );
        })}
        {/* Profile tab — opens drawer */}
        <button type="button" onClick={() => openDrawer('account')}
          className="flex-1 flex flex-col items-center justify-center gap-1"
          style={{ color: isProfileActive ? '#e8442a' : '#555' }}>
          <User size={22} />
          <span style={{ fontSize: '10px' }}>Profile</span>
        </button>
      </nav>
    </>
  );
}
