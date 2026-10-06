'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, ShoppingCart, UserRound } from 'lucide-react';
import Logo from '@/components/shared/Logo';
import NotificationBell from '@/components/notifications/NotificationBell';
import InstallPWA from '@/components/shared/InstallPWA';
import AppThemeToggle from '@/components/shared/AppThemeToggle';
import WorkspaceSwitcher from '@/components/shared/WorkspaceSwitcher';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import { updateUserProfile } from '@/lib/firebase/auth';
import { getWorkspaceDestination, hasAuthorWorkspace, type WorkspaceRole } from '@/lib/utils/workspace';
import { BUYER_DESKTOP_LINKS, getBuyerRouteState, isBuyerNavActive } from './buyerNavigation';
import './buyer-chrome.css';

export default function BuyerHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const cartCount = useCartStore((s) => s.items.length);
  const { userProfile, setUserProfile } = useAuthStore();
  const openDrawer = useBuyerDrawerStore((s) => s.open);
  const drawerOpen = useBuyerDrawerStore((s) => s.isOpen);
  const routeState = getBuyerRouteState(pathname);
  const canAccessAuthorWorkspace = hasAuthorWorkspace(userProfile);
  const initials = userProfile
    ? `${userProfile.firstName?.[0] ?? ''}${userProfile.lastName?.[0] ?? ''}`.toUpperCase()
    : '';
  const isProfileActive = pathname.startsWith('/profile') || drawerOpen;

  async function handleWorkspaceChange(nextRole: WorkspaceRole) {
    if (!userProfile || userProfile.activeRole === nextRole) return;
    await updateUserProfile(userProfile.uid, { activeRole: nextRole });
    setUserProfile({ ...userProfile, activeRole: nextRole });
    router.push(getWorkspaceDestination(nextRole));
  }

  return (
    <header className="app-header buyer-header sticky top-0 z-40">
      <div className="buyer-header-inner">
        <div className="buyer-header-top">
          <div className="buyer-header-brand">
            <div className="buyer-logo-full"><Logo href="/browse" size="sm" /></div>
            <div className="buyer-logo-compact"><Logo href="/browse" size="sm" compact /></div>
            <span className="buyer-header-tagline">African stories.<br />Endless possibilities.</span>
          </div>

          <div className="buyer-header-actions">
            {userProfile && canAccessAuthorWorkspace ? (
              <div className="buyer-workspace-switcher">
                <WorkspaceSwitcher activeRole={userProfile.activeRole} onChange={handleWorkspaceChange} size="sm" />
              </div>
            ) : null}
            <InstallPWA />
            <AppThemeToggle />
            <Link href={pathname.startsWith('/listen') ? '/listen#listen-search' : pathname.startsWith('/watch') ? '/watch#watch-search' : '/search'} className="buyer-header-action" aria-label={pathname.startsWith('/listen') ? 'Search audio' : pathname.startsWith('/watch') ? 'Search videos' : 'Search books'} title={pathname.startsWith('/listen') ? 'Search audio' : pathname.startsWith('/watch') ? 'Search videos' : 'Search books'}>
              <Search size={19} aria-hidden="true" />
            </Link>
            <Link href="/cart" className="buyer-header-action buyer-header-cart" aria-label={`Cart${cartCount ? `, ${cartCount} item${cartCount === 1 ? '' : 's'}` : ''}`} title="Cart">
              <ShoppingCart size={19} aria-hidden="true" />
              {cartCount > 0 ? <span className="buyer-cart-count" aria-hidden="true">{cartCount > 9 ? '9+' : cartCount}</span> : null}
            </Link>
            <NotificationBell />
            <button
              type="button"
              onClick={() => userProfile ? openDrawer('account') : router.push('/login')}
              aria-label={userProfile ? 'Open account' : 'Sign in'}
              aria-haspopup={userProfile ? 'dialog' : undefined}
              aria-expanded={userProfile ? drawerOpen : undefined}
              title={userProfile ? 'Your account' : 'Sign in'}
              className="buyer-account-button"
              data-active={isProfileActive}
            >
              {userProfile?.avatarUrl ? (
                <img src={userProfile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : initials || <UserRound size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="buyer-header-navigation">
          <nav aria-label="Bookstore navigation" className="buyer-desktop-nav">
            {BUYER_DESKTOP_LINKS.map((item) => {
              const { label, href, icon: Icon } = item;
              const active = isBuyerNavActive(pathname, item);
              return (
                <Link key={href} href={href!} aria-current={active ? 'page' : undefined} className="buyer-desktop-link">
                  <Icon size={16} aria-hidden="true" />
                  <span>{label}</span>
                  {href === '/cart' && cartCount > 0 ? <span className="buyer-nav-count">{cartCount > 9 ? '9+' : cartCount}</span> : null}
                </Link>
              );
            })}
          </nav>
          <span className="buyer-header-context">{routeState.title}</span>
        </div>
      </div>
    </header>
  );
}
