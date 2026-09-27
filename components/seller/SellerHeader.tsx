'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, BookOpen, BarChart2, Megaphone } from 'lucide-react';
import Logo from '@/components/shared/Logo';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useAuthStore } from '@/store/authStore';
import { useSellerDrawerStore } from '@/store/profileDrawerStore';

const NAV = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Books', href: '/listings', icon: BookOpen },
  { label: 'Promote', href: '/promotions', icon: Megaphone },
  { label: 'Earnings', href: '/analytics', icon: BarChart2 },
];

export default function SellerHeader() {
  const pathname = usePathname();
  const userProfile = useAuthStore((state) => state.userProfile);
  const openDrawer = useSellerDrawerStore((state) => state.open);
  const drawerOpen = useSellerDrawerStore((state) => state.isOpen);
  const initials = userProfile ? `${userProfile.firstName?.[0] ?? ''}${userProfile.lastName?.[0] ?? ''}`.toUpperCase() : '?';
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/') || (href === '/listings' && pathname === '/publish');

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#10100f]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo href="/dashboard" size="sm" />
            <span className="hidden border-l border-white/15 pl-3 text-[12px] text-[#a8a49c] sm:block">Author studio</span>
          </div>
          <nav aria-label="Author workspace" className="hidden h-full items-center gap-7 md:flex">
            {NAV.map(({ label, href }) => <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined} className={`inline-flex h-full items-center border-b-2 text-[14px] transition-colors ${isActive(href) ? 'border-[#ed896b] text-[#f5f2eb]' : 'border-transparent text-[#a8a49c] hover:text-white'}`}>{label}</Link>)}
          </nav>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button type="button" aria-label="Open author profile" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => openDrawer('identity')} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[#33291e] text-[14px] font-semibold text-[#f3d9ae]">
              {userProfile?.avatarUrl ? <img src={userProfile.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </button>
          </div>
        </div>
      </header>
      {!drawerOpen && <nav aria-label="Author workspace" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-white/10 bg-[#10100f]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {NAV.map(({ label, href, icon: Icon }) => <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined} className={`flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 text-[11px] ${isActive(href) ? 'text-[#ffab8e]' : 'text-[#a8a49c]'}`}><Icon size={20} aria-hidden="true" />{label}</Link>)}
      </nav>}
    </>
  );
}
