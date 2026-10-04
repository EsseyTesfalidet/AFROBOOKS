'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, BookOpen, PenLine, Wallet } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAndroidDevice } from '@/hooks/useAndroidDevice';
import { authorWebsiteHref } from '@/lib/app/authorWebsite';
import { hasAuthorWorkspace } from '@/lib/utils/workspace';

export default function MobileAuthorStart() {
  const profile = useAuthStore(state => state.userProfile);
  const android = useAndroidDevice();
  const author = !!profile && hasAuthorWorkspace(profile);
  return <main className="app-canvas app-page min-h-dvh px-5 py-6" style={{ color: 'var(--app-text)' }}>
    <div className="mx-auto max-w-lg space-y-7">
      <Link href="/browse" className="inline-flex min-h-11 items-center gap-2 text-sm" style={{ color: 'var(--app-muted)' }}><ArrowLeft size={18} />Back to reading</Link>
      <header className="space-y-3"><span className="inline-flex rounded-2xl p-3" style={{ background: 'var(--app-surface)', color: 'var(--app-accent)' }}><PenLine size={28} /></span><h1 className="text-3xl font-bold tracking-tight">{author ? 'Your author space' : 'Become an author'}</h1><p className="text-sm leading-relaxed" style={{ color: 'var(--app-muted)' }}>Share your stories with AfroBooks. Your reader account and library stay with you.</p></header>
      <section className="space-y-4 rounded-2xl border p-5" style={{ borderColor: 'var(--app-line)', background: 'var(--app-surface)' }}>
        <h2 className="text-lg font-semibold">Author tools on the website</h2>
        <p className="flex items-center gap-3 text-sm"><BookOpen size={19} />Publish books, stories and magazines</p>
        <p className="flex items-center gap-3 text-sm"><Wallet size={19} />Manage sales and author payouts</p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--app-muted)' }}>Use your usual sign-in method on the website. Choose “Back to app” there when you finish.</p>
        <a href={authorWebsiteHref(android)} {...(!android ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="button-primary flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-semibold">{android ? 'Open author tools in Chrome' : 'Open author tools on the website'}<ArrowUpRight size={17} /></a>
      </section>
      <Link href="/library" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium" style={{ borderColor: 'var(--app-line)' }}><BookOpen size={18} />Return to my library</Link>
    </div>
  </main>;
}
