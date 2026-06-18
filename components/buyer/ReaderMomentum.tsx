'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BellRing, BookOpen, Compass, Sparkles } from 'lucide-react';
import { getBook, getBooksByGenre, getBooksBySellerIds, getFollowedSellerIds, getActiveReadingProgress } from '@/lib/firebase/firestore';
import type { Book } from '@/types/book';
import type { ReadingProgress } from '@/types/order';

interface MomentumCard {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  accent: string;
  icon: 'resume' | 'followed' | 'genre' | 'subscription';
}

interface Props {
  userId: string;
  favoriteGenre: string;
  subscriptionActive: boolean;
}

function iconFor(type: MomentumCard['icon']) {
  if (type === 'resume') return BookOpen;
  if (type === 'followed') return BellRing;
  if (type === 'genre') return Compass;
  return Sparkles;
}

export default function ReaderMomentum({ userId, favoriteGenre, subscriptionActive }: Props) {
  const [cards, setCards] = useState<MomentumCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadMomentum() {
      setLoading(true);

      const [progresses, followedSellerIds, genreBooks] = await Promise.all([
        getActiveReadingProgress(userId),
        getFollowedSellerIds(userId, 8),
        getBooksByGenre(favoriteGenre || 'Fiction', 6),
      ]);

      const [resumeBook, followedBooks] = await Promise.all([
        progresses[0] ? getBook(progresses[0].bookId) : Promise.resolve(null),
        followedSellerIds.length
          ? getBooksBySellerIds(followedSellerIds, 6)
          : Promise.resolve([]),
      ]);

      if (!active) return;

      const nextCards: MomentumCard[] = [];
      const topProgress = progresses[0];

      if (topProgress && resumeBook) {
        nextCards.push({
          id: `resume_${resumeBook.id}`,
          title: `Continue "${resumeBook.title}"`,
          body: `${Math.max(1, Math.round(topProgress.percentComplete))}% finished · Chapter ${topProgress.currentChapter}`,
          href: `/read/${resumeBook.id}`,
          cta: 'Resume reading',
          accent: '#e8442a',
          icon: 'resume',
        });
      }

      const followedBook = followedBooks[0];
      if (followedBook) {
        nextCards.push({
          id: `followed_${followedBook.id}`,
          title: 'Fresh from authors you follow',
          body: `${followedBook.authorName} just dropped "${followedBook.title}".`,
          href: `/book/${followedBook.id}`,
          cta: 'Open release',
          accent: '#0ea5e9',
          icon: 'followed',
        });
      }

      const genreBook = genreBooks.find((book) => book.id !== followedBook?.id && book.id !== resumeBook?.id);
      if (genreBook) {
        nextCards.push({
          id: `genre_${genreBook.id}`,
          title: `Because you like ${favoriteGenre || 'Fiction'}`,
          body: `Try "${genreBook.title}" by ${genreBook.authorName}.`,
          href: `/book/${genreBook.id}`,
          cta: 'View recommendation',
          accent: '#7c3aed',
          icon: 'genre',
        });
      }

      if (!subscriptionActive) {
        nextCards.push({
          id: 'subscription',
          title: 'Unlock subscriber shelves',
          body: 'Get unlimited access to subscription titles and curated bundles.',
          href: '/subscription',
          cta: 'See plans',
          accent: '#f5b800',
          icon: 'subscription',
        });
      }

      setCards(nextCards.slice(0, 3));
      setLoading(false);
    }

    loadMomentum();

    return () => {
      active = false;
    };
  }, [favoriteGenre, subscriptionActive, userId]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-[148px] animate-pulse rounded-2xl border"
              style={{ background: '#111', borderColor: '#1a1a1a' }}
            />
          ))}
        </div>
      );
    }

    if (!cards.length) return null;

    return (
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
        {cards.map((card) => {
          const Icon = iconFor(card.icon);

          return (
            <Link
              key={card.id}
              href={card.href}
              className="min-w-[260px] flex-1 rounded-2xl border p-4 transition-transform hover:-translate-y-0.5 sm:min-w-0"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{ background: `${card.accent}22`, color: card.accent }}
                >
                  <Icon size={18} />
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: '#151515', color: '#777' }}
                >
                  Momentum
                </span>
              </div>
              <p className="text-base font-semibold text-white">{card.title}</p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: '#666' }}>
                {card.body}
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium" style={{ color: card.accent }}>
                {card.cta} <ArrowRight size={14} />
              </div>
            </Link>
          );
        })}
      </div>
    );
  }, [cards, loading]);

  if (!content) return null;

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: '#666' }}>
          Momentum
        </p>
        <h2 className="font-display text-display-sm text-white">Keep the reading loop alive</h2>
      </div>
      {content}
    </section>
  );
}
