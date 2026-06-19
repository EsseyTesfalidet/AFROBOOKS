'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, BookOpen, Flag, DollarSign,
  CreditCard, Radio, AlertTriangle, Megaphone, Settings, LogOut, ShieldCheck,
} from 'lucide-react';
import Logo from '@/components/shared/Logo';
import { logOutAndRedirect } from '@/lib/firebase/auth';
import { useAuthStore } from '@/store/authStore';
import AvatarUpload from '@/components/shared/AvatarUpload';

const NAV = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Books', href: '/admin/books', icon: BookOpen },
  { label: 'Flagged', href: '/admin/flagged', icon: Flag },
  { label: 'Revenue', href: '/admin/revenue', icon: DollarSign },
  { label: 'Payouts', href: '/admin/payouts', icon: CreditCard },
  { label: 'Subscriptions', href: '/admin/subscriptions', icon: Radio },
  { label: 'Verifications', href: '/admin/verifications', icon: ShieldCheck },
  { label: 'Reports', href: '/admin/reports', icon: AlertTriangle },
  { label: 'Announcements', href: '/admin/announcements', icon: Megaphone },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const userProfile = useAuthStore((s) => s.userProfile);
  const currentSection = NAV.find(({ href }) => pathname === href || (href !== '/admin' && pathname.startsWith(href)))?.label ?? 'Dashboard';

  async function handleSignOut() {
    await logOutAndRedirect('/login');
  }

  return (
    <aside className="hidden md:flex w-52 flex-shrink-0 min-h-screen flex-col py-5 px-3" style={{ background: '#0d0d0d', borderRight: '1px solid #1a1a1a' }}>
      <div className="flex items-center gap-2 px-2 mb-4">
        <Logo size="sm" />
        <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: '#1f0e0c', color: '#e8442a' }}>ADMIN</span>
      </div>
      <div
        className="flex flex-col items-center py-4 px-3 mb-3 rounded-2xl border space-y-2"
        style={{
          background: 'linear-gradient(180deg, rgba(232,68,42,0.14) 0%, rgba(17,17,17,0.96) 52%, rgba(245,184,0,0.08) 100%)',
          borderColor: '#2a2111',
        }}
      >
        <AvatarUpload size={52} />
        <p className="text-sm font-medium text-white text-center">{userProfile?.firstName} {userProfile?.lastName}</p>
        <p className="text-xs text-[#9ca3af]">Administrator</p>
        <div className="flex flex-wrap justify-center gap-2">
          <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: '#0f2e1a', color: '#4ade80' }}>
            Live Ops
          </span>
          <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: '#1a1a2e', color: '#93c5fd' }}>
            {currentSection}
          </span>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/admin' && pathname.startsWith(href));
          return (
            <Link key={href} href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ background: active ? '#1f0e0c' : 'transparent', color: active ? '#e8442a' : '#666' }}>
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>
      <button type="button" onClick={handleSignOut}
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[#1a1a1a] mt-2 mb-12"
        style={{ color: '#555' }}>
        <LogOut size={15} />
        Sign out
      </button>
    </aside>
  );
}
