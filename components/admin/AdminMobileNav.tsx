'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, BookOpen, Flag, DollarSign,
  CreditCard, Radio, ShieldCheck, AlertTriangle, Megaphone, Settings,
} from 'lucide-react';
import Logo from '@/components/shared/Logo';
import { logOut } from '@/lib/firebase/auth';

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

export default function AdminMobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="md:hidden sticky top-0 z-50" style={{ background: '#0d0d0d', borderBottom: '1px solid #1a1a1a' }}>
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <Logo href="/admin" size="sm" />
          <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: '#1f0e0c', color: '#e8442a' }}>ADMIN</span>
        </div>
        <button
          type="button"
          onClick={async () => { await logOut(); router.replace('/login'); }}
          className="text-xs px-2.5 py-1 rounded-lg border"
          style={{ borderColor: '#333', color: '#888' }}
        >
          Sign out
        </button>
      </div>
      <div className="overflow-x-auto px-4 pb-2 pt-1" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div className="flex gap-2 w-max">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== '/admin' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                style={{
                  background: active ? '#1f0e0c' : '#1a1a1a',
                  color: active ? '#e8442a' : '#666',
                  border: `1px solid ${active ? '#e8442a33' : '#222'}`,
                }}
              >
                <Icon size={13} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
