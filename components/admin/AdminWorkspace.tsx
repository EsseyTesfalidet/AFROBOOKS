'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Search, ArrowUpRight, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { logOutAndRedirect } from '@/lib/firebase/auth';
import { ADMIN_NAV } from './navigation';
import SeparateAccountLink from '@/components/auth/SeparateAccountLink';

export default function AdminWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, userProfile } = useAuthStore();
  const [search, setSearch] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const section = ADMIN_NAV.find((item) => item.href === pathname)?.label ?? 'Administration';
  if (loading)
    return (
      <div className="admin-workspace grid min-h-screen place-items-center">
        <p role="status">Opening your workspace…</p>
      </div>
    );
  if (userProfile?.role !== 'admin' || ['suspended', 'banned'].includes(userProfile.status))
    return (
      <div className="admin-workspace grid min-h-screen place-items-center">
        <div>
          <h1>Administrator access required</h1>
          <Link href="/login" className="admin-link">
            Sign in
          </Link>
        </div>
      </div>
    );
  return (
    <div className="admin-workspace">
      <a href="#admin-content" className="admin-skip">
        Skip to content
      </a>
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-brand">
          AfroBooks<span>Workspace</span>
        </Link>
        <label className="admin-nav-search">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="Find an admin section"
            placeholder="Find a section…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <nav aria-label="Administration">
          {['Workspace', 'Review', 'Finance', 'Manage'].map((group) => {
            const items = ADMIN_NAV.filter(
              (item) =>
                item.group === group &&
                item.label.toLowerCase().includes(search.trim().toLowerCase()),
            );
            return (
              items.length > 0 && (
                <div key={group} className="admin-nav-group">
                  <p>{group}</p>
                  {items.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      aria-current={pathname === href ? 'page' : undefined}
                    >
                      <Icon size={17} aria-hidden="true" />
                      {label}
                    </Link>
                  ))}
                </div>
              )
            );
          })}
          {search &&
            !ADMIN_NAV.some((item) =>
              item.label.toLowerCase().includes(search.trim().toLowerCase()),
            ) && <p className="admin-muted p-3 text-sm">No matching sections.</p>}
        </nav>
        <SeparateAccountLink />
        <div className="admin-account">
          <span className="admin-avatar">{userProfile.firstName?.[0] ?? 'A'}</span>
          <div>
            <p>
              {userProfile.firstName} {userProfile.lastName}
            </p>
            <span>Administrator</span>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            onClick={() => {
              void logOutAndRedirect('/login').catch(() =>
                setSignOutError('Unable to sign out. Try again.'),
              );
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
        {signOutError && (
          <p role="alert" className="text-sm text-red-300">
            {signOutError}
          </p>
        )}
      </aside>
      <div className="admin-body">
        <header className="admin-topbar">
          <p>
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            {section}
          </p>
          <div className="flex items-center gap-3">
            <Link href="/browse">
              View bookstore <ArrowUpRight size={15} />
            </Link>
            <button
              type="button"
              className="admin-mobile-signout md:hidden p-2"
              aria-label="Sign out"
              onClick={() => {
                void logOutAndRedirect('/login').catch(() =>
                  setSignOutError('Unable to sign out. Try again.'),
                );
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        {signOutError && (
          <p role="alert" className="admin-mobile-error md:hidden p-4 text-red-300">
            {signOutError}
          </p>
        )}
        <div className="admin-mobile-menu">
          <label htmlFor="admin-section">Navigate</label>
          <select
            id="admin-section"
            value={pathname}
            onChange={(event) => {
              window.location.assign(event.target.value);
            }}
          >
            {ADMIN_NAV.map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div id="admin-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
