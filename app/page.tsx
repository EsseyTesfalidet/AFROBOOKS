'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Feather, Star, Users, BookMarked, Zap, ArrowRight, CheckCircle, Search } from 'lucide-react';
import Logo from '@/components/shared/Logo';
import { useAuthStore } from '@/store/authStore';
import { getLiveBooks } from '@/lib/firebase/firestore';
import { orderBy, limit } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';

const GENRES = ['Fiction', 'History', 'Science', 'Fantasy', 'Romance', 'Biography', 'Self-Help', 'Business', 'Poetry'];

export default function LandingPage() {
  const router = useRouter();
  const { userProfile, loading } = useAuthStore();
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    if (!loading && userProfile) {
      if (userProfile.role === 'admin') router.replace('/admin');
      else if (userProfile.activeRole === 'seller') router.replace('/dashboard');
      else router.replace('/browse');
    }
  }, [loading, userProfile]);

  useEffect(() => {
    getLiveBooks([orderBy('publishedAt', 'desc'), limit(8)]).then(setBooks);
  }, []);

  if (loading) return null;
  if (userProfile) return null;

  return (
    <div className="min-h-screen" style={{ background: '#0e0e0e', color: '#f5f2eb' }}>

      {/* ── NAV ── */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-5 sm:px-10 h-16"
        style={{ background: 'rgba(14,14,14,0.92)', backdropFilter: 'blur(14px)', borderBottom: '1px solid #1a1a1a' }}
      >
        <Logo size="sm" />
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/browse"
            className="hidden sm:block text-sm px-4 py-2 rounded-lg transition-colors"
            style={{ color: '#888' }}>
            Browse
          </Link>
          <Link href="/login"
            className="text-sm px-4 py-2 rounded-lg transition-colors"
            style={{ color: '#888' }}>
            Sign In
          </Link>
          <Link href="/signup"
            className="text-sm px-4 py-2 rounded-lg font-semibold transition-all"
            style={{ background: '#e8442a', color: '#fff' }}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative px-5 sm:px-10 pt-20 pb-24 text-center overflow-hidden">
        {/* Red glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 80% 55% at 50% -5%, rgba(232,68,42,0.18) 0%, transparent 65%)',
        }} />
        {/* Gold glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 40% 30% at 80% 20%, rgba(245,184,0,0.06) 0%, transparent 60%)',
        }} />

        <div className="relative max-w-3xl mx-auto">
          <span
            className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-8 uppercase tracking-widest"
            style={{ background: '#1a1a1a', color: '#f5b800', border: '1px solid #2a2a2a' }}
          >
            Africa's Boldest Ebook Marketplace
          </span>

          <h1 className="font-display text-5xl sm:text-7xl leading-none mb-6 tracking-tight">
            Africa's Stories,
            <br />
            <span style={{ color: '#f5b800' }}>Your World.</span>
          </h1>

          <p className="text-lg sm:text-xl max-w-xl mx-auto mb-10 leading-relaxed" style={{ color: '#777' }}>
            Discover thousands of ebooks by African authors. Buy, read, and support the writers shaping tomorrow's culture — all in one place.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Link href="/browse"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-semibold transition-opacity hover:opacity-90"
              style={{ background: '#e8442a', color: '#fff' }}>
              Browse Books <ArrowRight size={18} />
            </Link>
            <Link href="/signup?role=seller"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-medium border transition-all hover:border-[#555]"
              style={{ borderColor: '#2a2a2a', color: '#aaa', background: '#111' }}>
              <Feather size={16} /> Start Selling
            </Link>
          </div>

          <p className="text-xs" style={{ color: '#444' }}>
            Free to browse · No subscription required
          </p>
        </div>
      </section>

      {/* ── STATS ── */}
      <div style={{ borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a' }}>
        <div className="max-w-4xl mx-auto px-5 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { value: '10K+', label: 'Active Readers', icon: Users },
            { value: '500+', label: 'Ebooks', icon: BookOpen },
            { value: '100+', label: 'African Authors', icon: Feather },
            { value: '4.8★', label: 'Reader Rating', icon: Star },
          ].map(({ value, label, icon: Icon }) => (
            <div key={label}>
              <Icon size={16} className="mx-auto mb-2" style={{ color: '#e8442a' }} />
              <p className="font-display text-3xl sm:text-4xl" style={{ color: '#f5b800' }}>{value}</p>
              <p className="text-xs mt-1" style={{ color: '#555' }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURED BOOKS ── */}
      {books.length > 0 && (
        <section className="py-16">
          <div className="px-5 sm:px-10 mb-8 flex items-end justify-between max-w-6xl mx-auto">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#e8442a' }}>Just Added</p>
              <h2 className="font-display text-3xl text-white">New Releases</h2>
            </div>
            <Link href="/browse" className="text-sm flex items-center gap-1 transition-colors hover:text-white" style={{ color: '#f5b800' }}>
              View all <ArrowRight size={14} />
            </Link>
          </div>

          <div
            className="flex gap-4 overflow-x-auto px-5 sm:px-10 pb-4 sm:grid sm:grid-cols-4 sm:overflow-visible sm:max-w-6xl sm:mx-auto"
            style={{ scrollbarWidth: 'none' } as React.CSSProperties}
          >
            {books.map((book) => (
              <Link key={book.id} href={`/book/${book.id}`}
                className="flex-shrink-0 w-40 sm:w-auto rounded-xl overflow-hidden border transition-transform hover:-translate-y-1"
                style={{ border: '1px solid #1a1a1a', background: '#111' }}>
                <div className="relative" style={{ height: 150, background: book.coverBgColor || '#1a1040' }}>
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.9))' }} />
                  {book.coverUrl && (
                    <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                  )}
                  <div className="absolute top-2 right-2">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: '#f5b800', color: '#000', fontSize: 8 }}>EBOOK</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: book.coverAccentColor || '#f5b800', fontSize: 8 }}>{book.genre}</p>
                    <p className="font-display text-white leading-tight" style={{ fontSize: 13 }}>{book.title}</p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>{book.authorName}</p>
                  </div>
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <p className="text-sm font-medium" style={{ color: '#f5b800' }}>{centsToDisplay(book.price)}</p>
                  {book.averageRating > 0 && (
                    <p className="text-xs" style={{ color: '#555' }}>★ {book.averageRating.toFixed(1)}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── GENRES ── */}
      <section className="px-5 sm:px-10 py-16 max-w-3xl mx-auto text-center">
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#e8442a' }}>Categories</p>
        <h2 className="font-display text-3xl text-white mb-8">Browse by Genre</h2>
        <div className="flex flex-wrap gap-3 justify-center">
          {GENRES.map((g) => (
            <Link key={g} href="/browse"
              className="px-4 py-2 rounded-full text-sm font-medium border transition-all hover:border-[#e8442a] hover:text-white"
              style={{ borderColor: '#222', color: '#666', background: '#111' }}>
              {g}
            </Link>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="px-5 sm:px-10 py-20" style={{ background: '#080808', borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a' }}>
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#e8442a' }}>Simple Process</p>
          <h2 className="font-display text-3xl text-white mb-14">How It Works</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { step: '01', icon: Search, title: 'Discover', desc: 'Browse thousands of ebooks across every genre from African authors around the world.' },
              { step: '02', icon: Zap, title: 'Purchase', desc: 'Buy instantly with secure checkout. Your book is added to your library immediately.' },
              { step: '03', icon: BookOpen, title: 'Read', desc: 'Read inside the app — beautiful reader, dark mode, adjustable fonts. No downloads needed.' },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative p-8 rounded-2xl text-left border" style={{ background: '#0e0e0e', borderColor: '#1a1a1a' }}>
                <span
                  className="font-display absolute -top-5 left-4 select-none"
                  style={{ fontSize: 72, lineHeight: 1, color: '#141414', fontWeight: 700 }}
                >
                  {step}
                </span>
                <div
                  className="relative w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: '#1a1a1a' }}
                >
                  <Icon size={20} style={{ color: '#e8442a' }} />
                </div>
                <h3 className="font-display text-xl text-white mb-2">{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#555' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR AUTHORS ── */}
      <section className="px-5 sm:px-10 py-20">
        <div className="max-w-5xl mx-auto rounded-3xl p-10 sm:p-16 relative overflow-hidden" style={{ background: '#0e0e0e', border: '1px solid #1a1a1a' }}>
          {/* Glow */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 50% 70% at 90% 50%, rgba(245,184,0,0.07) 0%, transparent 65%)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 40% 40% at 10% 50%, rgba(232,68,42,0.05) 0%, transparent 60%)' }} />

          <div className="relative sm:max-w-lg">
            <span
              className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-6 uppercase tracking-widest"
              style={{ background: '#1a1000', color: '#f5b800', border: '1px solid #2a2000' }}
            >
              For Authors
            </span>
            <h2 className="font-display text-4xl sm:text-5xl text-white mb-5 leading-tight">
              Publish Your Story<br />to the World
            </h2>
            <p className="text-base mb-8 leading-relaxed" style={{ color: '#666' }}>
              Join hundreds of African authors already earning on AfroBooks. Upload your ebook, set your price, and keep 85% of every sale.
            </p>
            <ul className="space-y-3 mb-10">
              {[
                'Keep 85% of every sale',
                'In-app reading — zero piracy risk',
                'Built-in audience of African literature fans',
                'Real-time earnings and analytics dashboard',
                'Co-author revenue sharing built in',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm" style={{ color: '#aaa' }}>
                  <CheckCircle size={14} style={{ color: '#f5b800', flexShrink: 0 }} />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/signup?role=seller"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-xl text-sm font-bold transition-opacity hover:opacity-90"
              style={{ background: '#f5b800', color: '#000' }}>
              Start Publishing Free <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section
        className="px-5 sm:px-10 py-24 text-center"
        style={{ background: '#080808', borderTop: '1px solid #1a1a1a' }}
      >
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#e8442a' }}>Join AfroBooks</p>
          <h2 className="font-display text-4xl sm:text-6xl text-white mb-5 leading-tight">
            Ready to start<br />reading?
          </h2>
          <p className="text-base mb-10" style={{ color: '#555' }}>
            Join thousands of readers discovering African literature every day.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-semibold transition-opacity hover:opacity-90"
              style={{ background: '#e8442a', color: '#fff' }}>
              Create Free Account <ArrowRight size={18} />
            </Link>
            <Link href="/browse"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-medium border transition-all hover:border-[#555]"
              style={{ borderColor: '#2a2a2a', color: '#888', background: '#111' }}>
              Browse Without Account
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="px-5 sm:px-10 py-10" style={{ borderTop: '1px solid #1a1a1a' }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <Logo size="sm" />
          <nav className="flex flex-wrap items-center justify-center gap-5 text-sm" style={{ color: '#444' }}>
            <Link href="/browse" className="hover:text-white transition-colors">Browse</Link>
            <Link href="/discover" className="hover:text-white transition-colors">Discover</Link>
            <Link href="/subscription" className="hover:text-white transition-colors">Subscription</Link>
            <Link href="/signup?role=seller" className="hover:text-white transition-colors">Sell Books</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
          </nav>
          <p className="text-xs" style={{ color: '#2a2a2a' }}>© 2025 AFROBOOKS</p>
        </div>
      </footer>

    </div>
  );
}
