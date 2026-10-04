'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import BookCover from '@/components/shared/BookCover';
import { authenticatedPost } from '@/lib/firebase/request';
import { useAuthStore } from '@/store/authStore';
import type { Book } from '@/types/book';

interface Placement {
  id: string;
  bookId: string;
  endsAt: number;
}
export default function SponsoredBook({ books }: { books: Book[] }) {
  const uid = useAuthStore((state) => state.userProfile?.uid);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const container = useRef<HTMLElement>(null);
  const sent = useRef('');
  const book = books.find((item) => item.id === placement?.bookId && item.status === 'live');
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    async function refresh() {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch('/api/promotions/placement', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (active && response.ok)
          setPlacement(data.placement?.endsAt > Date.now() ? data.placement : null);
        else if (active) setPlacement(null);
      } catch (error) {
        if (active && !(error instanceof Error && error.name === 'AbortError')) setPlacement(null);
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  useEffect(() => {
    if (!placement) return;
    const timer = setTimeout(() => setPlacement(null), Math.max(0, placement.endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [placement]);
  useEffect(() => {
    const node = container.current;
    if (!node || !uid || !placement || !book) return;
    const key = `${uid}:${placement.id}:${new Date().toISOString().slice(0, 10)}`;
    if (sent.current === key) return;
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function schedule() {
      clearTimeout(timer);
      if (visible && !document.hidden && sent.current !== key)
        timer = setTimeout(() => {
          sent.current = key;
          void authenticatedPost('/api/promotions/event', {
            id: placement!.id,
            kind: 'view',
          }).catch(() => {
            if (sent.current === key) sent.current = '';
          });
        }, 1000);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].intersectionRatio >= 0.5;
        schedule();
      },
      { threshold: [0.5] },
    );
    observer.observe(node);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [uid, placement, book]);
  if (!placement || !book) return null;
  return (
    <section
      ref={container}
      aria-label="Sponsored book"
      className="app-sponsored-book rounded-2xl border border-[#4b4335] bg-gradient-to-r from-[#2b271f] to-[#191b17] p-5 sm:p-7"
    >
      <p className="mb-5 text-[11px] font-semibold uppercase tracking-[.16em] text-[#d8c2a2]">
        Sponsored · Author promotion
      </p>
      <Link
        href={`/book/${book.id}`}
        className="group flex items-center gap-5 sm:gap-8"
        onClick={() => {
          if (uid)
            void authenticatedPost('/api/promotions/event', {
              id: placement.id,
              kind: 'click',
            }).catch(() => {});
        }}
      >
        <div className="w-[86px] shrink-0 sm:w-[112px]">
          <BookCover book={book} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-[#bcb4a5]">{book.genre}</p>
          <h2 className="mt-2 break-words font-serif text-[24px] leading-tight text-[#f5f2eb] sm:text-[30px]">
            {book.title}
          </h2>
          <p className="mt-2 text-[13px] text-[#bcb4a5]">By {book.authorName}</p>
          <span className="mt-5 inline-flex min-h-11 items-center gap-2 text-[13px] text-[#ead8b8] group-hover:underline">
            Explore this book <ArrowUpRight size={15} aria-hidden="true" />
          </span>
        </div>
      </Link>
    </section>
  );
}
