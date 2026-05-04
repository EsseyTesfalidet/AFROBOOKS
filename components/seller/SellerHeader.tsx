'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, BookOpen, BarChart2, User } from 'lucide-react';
import Logo from '@/components/shared/Logo';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useAuthStore } from '@/store/authStore';
import { updateUserProfile, logOut } from '@/lib/firebase/auth';

const DESKTOP_NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Listings', href: '/listings' },
  { label: 'Analytics', href: '/analytics' },
];

const MOBILE_NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Listings', href: '/listings', icon: BookOpen },
  { label: 'Analytics', href: '/analytics', icon: BarChart2 },
  { label: 'Profile', href: '/seller/profile/identity', icon: User },
];

export default function SellerHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, setUserProfile } = useAuthStore();
  const initials = userProfile
    ? `${userProfile.firstName[0] ?? ''}${userProfile.lastName[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <>
      {/* Top header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-5 h-14"
        style={{ background: '#0e0e0e', borderBottom: '1px solid #222' }}
      >
        <div className="flex items-center gap-3">
          <Logo href="/dashboard" size="sm" />
          <span
            className="text-xs px-2 py-0.5 rounded font-bold"
            style={{ background: '#2e1a0f', color: '#f5b800' }}
          >
            SELLER
          </span>
        </div>

        {/* Desktop nav — hidden on mobile */}
        <nav className="hidden sm:flex items-center gap-1">
          {DESKTOP_NAV.map(({ label, href }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link key={href} href={href}
                className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: active ? '#e8442a' : '#fff', color: active ? '#fff' : '#000' }}>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {userProfile?.role === 'both' && (
            <button type="button"
              onClick={async () => {
                await updateUserProfile(userProfile.uid, { activeRole: 'buyer' });
                setUserProfile({ ...userProfile, activeRole: 'buyer' });
                router.push('/browse');
              }}
              className="hidden sm:block text-xs px-2.5 py-1 rounded-lg border"
              style={{ borderColor: '#333', color: '#888' }}>
              Switch to Buyer
            </button>
          )}
          <button type="button"
            onClick={async () => { await logOut(); router.replace('/login'); }}
            className="hidden sm:block text-xs px-2.5 py-1 rounded-lg border"
            style={{ borderColor: '#333', color: '#888' }}>
            Sign out
          </button>
          <NotificationBell />
          <button type="button" onClick={() => router.push('/seller/profile/identity')}
            className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-display text-sm flex-shrink-0"
            style={{ background: '#f5b800', color: '#000' }}>
            {userProfile?.avatarUrl
              ? <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              : initials}
          </button>
        </div>
      </header>

      {/* Mobile bottom nav — hidden on sm+ */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex"
        style={{
          background: '#0e0e0e',
          borderTop: '1px solid #222',
          height: 60,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {MOBILE_NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-1"
              style={{ color: active ? '#f5b800' : '#555' }}
            >
              <Icon size={22} />
              <span style={{ fontSize: '10px' }}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
