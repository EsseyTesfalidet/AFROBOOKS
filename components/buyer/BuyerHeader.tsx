'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Library, ShoppingCart, User } from 'lucide-react';
import Logo from '@/components/shared/Logo';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';

const NAV = [
  { label: 'Browse', href: '/browse', icon: BookOpen },
  { label: 'My Library', href: '/library', icon: Library },
  { label: 'Cart', href: '/cart', icon: ShoppingCart },
  { label: 'Profile', href: '/profile/account', icon: User },
];

export default function BuyerHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const cartCount = useCartStore((s) => s.items.length);
  const userProfile = useAuthStore((s) => s.userProfile);

  const initials = userProfile
    ? `${userProfile.firstName[0] ?? ''}${userProfile.lastName[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-5 h-14"
      style={{ background: '#0e0e0e', borderBottom: '1px solid #222' }}
    >
      <Logo href="/browse" size="sm" />

      <nav className="flex items-center gap-1">
        {NAV.map(({ label, href }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          const isCart = href === '/cart';
          return (
            <Link
              key={href}
              href={href}
              className="relative px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? '#e8442a' : '#fff',
                color: active ? '#fff' : '#000',
              }}
            >
              {label}
              {isCart && cartCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: '#e8442a', color: '#fff', fontSize: '10px' }}
                >
                  {cartCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <NotificationBell />
        <button
          type="button"
          onClick={() => router.push('/profile/account')}
          className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-display text-sm flex-shrink-0"
          style={{ background: '#e8442a', color: '#fff' }}
        >
          {userProfile?.avatarUrl
            ? <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            : initials}
        </button>
      </div>
    </header>
  );
}
