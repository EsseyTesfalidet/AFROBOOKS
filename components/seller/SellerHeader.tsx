'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, BookOpen, BarChart2, User, LogOut } from 'lucide-react';
import Logo from '@/components/shared/Logo';
import NotificationBell from '@/components/notifications/NotificationBell';
import WorkspaceSwitcher from '@/components/shared/WorkspaceSwitcher';
import { useAuthStore } from '@/store/authStore';
import { updateUserProfile, logOut } from '@/lib/firebase/auth';
import { useSellerDrawerStore } from '@/store/profileDrawerStore';
import { getWorkspaceDestination, type WorkspaceRole } from '@/lib/utils/workspace';

const DESKTOP_NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Listings', href: '/listings' },
  { label: 'Analytics', href: '/analytics' },
];

const MOBILE_NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Listings', href: '/listings', icon: BookOpen },
  { label: 'Analytics', href: '/analytics', icon: BarChart2 },
];

export default function SellerHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, setUserProfile } = useAuthStore();
  const openDrawer = useSellerDrawerStore((s) => s.open);
  const drawerOpen = useSellerDrawerStore((s) => s.isOpen);

  const initials = userProfile
    ? `${userProfile.firstName[0] ?? ''}${userProfile.lastName[0] ?? ''}`.toUpperCase()
    : '?';

  const isProfileActive = pathname.startsWith('/seller/profile');

  async function handleWorkspaceChange(nextRole: WorkspaceRole) {
    if (!userProfile || userProfile.activeRole === nextRole) return;
    await updateUserProfile(userProfile.uid, { activeRole: nextRole });
    setUserProfile({ ...userProfile, activeRole: nextRole });
    router.push(getWorkspaceDestination(nextRole));
  }

  return (
    <>
      {/* Top header */}
      <header
        className="surface-glass sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/5 px-4 sm:px-5"
      >
        <div className="flex items-center gap-3">
          <Logo href="/dashboard" size="sm" />
          <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ background: '#2e1a0f', color: '#f5b800' }}>
            AUTHOR
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {DESKTOP_NAV.map(({ label, href }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link key={href} href={href}
                className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: active ? 'linear-gradient(180deg, #f05b43 0%, #e8442a 100%)' : 'rgba(255,255,255,0.05)',
                  color: active ? '#fff' : '#d1d1d6',
                  border: `1px solid ${active ? '#e8442a' : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: active ? '0 14px 28px rgba(232,68,42,0.22)' : '0 10px 20px rgba(0,0,0,0.12)',
                }}>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {userProfile ? (
            <div className="hidden md:block">
              <WorkspaceSwitcher
                activeRole={userProfile.activeRole}
                onChange={handleWorkspaceChange}
                size="sm"
              />
            </div>
          ) : null}
          <button type="button"
            onClick={async () => { await logOut(); router.replace('/login'); }}
            className="hidden sm:block text-xs px-2.5 py-1 rounded-lg border"
            style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#b4b4bb', background: 'rgba(255,255,255,0.04)' }}>
            Sign out
          </button>
          {/* Sign-out icon — mobile only, near bell */}
          <button type="button" title="Sign out"
            onClick={async () => { await logOut(); router.replace('/login'); }}
            className="icon-button sm:hidden flex h-8 w-8 items-center justify-center rounded-lg">
            <LogOut size={17} />
          </button>
          <NotificationBell />
          {/* Avatar opens drawer */}
          <button type="button" onClick={() => openDrawer('identity')}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border font-display text-sm shadow-lg"
            style={{ background: '#f5b800', color: '#000', borderColor: 'rgba(255,255,255,0.2)' }}>
            {userProfile?.avatarUrl
              ? <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              : initials}
          </button>
        </div>
      </header>

      {/* Mobile bottom nav — hidden when profile drawer is open */}
      <nav
        className={`sm:hidden fixed bottom-0 left-0 right-0 z-50 flex${drawerOpen ? ' hidden' : ''}`}
        style={{
          background: 'rgba(14,14,14,0.92)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          height: 60,
          paddingBottom: 'env(safe-area-inset-bottom)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {MOBILE_NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link key={href} href={href}
              className="flex-1 flex flex-col items-center justify-center gap-1"
              style={{ color: active ? '#f5b800' : '#555' }}>
              <Icon size={22} />
                <span style={{ fontSize: '10px' }}>{label}</span>
              </Link>
          );
        })}
        {/* Profile tab — opens drawer */}
        <button type="button" onClick={() => openDrawer('identity')}
          className="flex-1 flex flex-col items-center justify-center gap-1"
          style={{ color: isProfileActive ? '#f5b800' : '#555' }}>
          <User size={22} />
          <span style={{ fontSize: '10px' }}>Profile</span>
        </button>
      </nav>
    </>
  );
}
