'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { getBook, getPreviewChapters } from '@/lib/firebase/firestore';
import { useCartStore } from '@/store/cartStore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';

export default function SampleReaderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { addItem } = useCartStore();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getBook(id), getPreviewChapters(id)]).then(([b, chs]) => {
      setBook(b);
      setChapters(chs);
      setLoading(false);
    });
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]">
      <LoadingSpinner size={36} />
    </div>
  );

  if (!book || chapters.length === 0) return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <div className="flex flex-col items-center justify-center pt-20 gap-4">
        <p className="text-[#444]">No sample available for this book.</p>
        <Link href={`/book/${id}`} className="text-sm underline" style={{ color: '#e8442a' }}>Back to book</Link>
      </div>
    </div>
  );

  function handleBuy() {
    if (!book) return;
    addItem(book);
    router.push('/cart');
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* Nav */}
        <div className="flex items-center justify-between mb-6">
          <Link href={`/book/${id}`} className="flex items-center gap-1.5 text-sm text-[#666] hover:text-white transition-colors">
            <ArrowLeft size={14} /> Back to book
          </Link>
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#1a1a1a', color: '#f5b800' }}>
            FREE SAMPLE
          </span>
        </div>

        {/* Book header */}
        <div className="mb-8">
          <h1 className="font-display text-display-md text-white">{book.title}</h1>
          <p className="text-sm text-[#666] mt-1">{book.authorName}</p>
        </div>

        {/* Chapter content */}
        {chapters.map((ch, i) => (
          <div key={ch.id} className="mb-10">
            <h2 className="font-display text-display-sm text-white mb-4">
              Chapter {ch.chapterNumber}: {ch.title}
            </h2>
            <div
              className="text-[#ccc] leading-relaxed text-base space-y-4 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: ch.content.replace(/\n/g, '<br/>') }}
            />
            {i < chapters.length - 1 && (
              <div className="my-8 border-t" style={{ borderColor: '#1a1a1a' }} />
            )}
          </div>
        ))}

        {/* Paywall CTA */}
        <div
          className="mt-8 p-8 rounded-2xl border text-center space-y-4"
          style={{ background: '#111', borderColor: '#1a1a1a' }}
        >
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#1a1a1a' }}>
              <Lock size={20} style={{ color: '#f5b800' }} />
            </div>
          </div>
          <p className="font-display text-display-sm text-white">Continue reading</p>
          <p className="text-sm text-[#666]">
            You've reached the end of the free sample. Purchase the full book to keep reading.
          </p>
          <button
            type="button"
            onClick={handleBuy}
            className="w-full py-3.5 rounded-xl text-sm font-medium"
            style={{ background: '#e8442a', color: '#fff' }}
          >
            Buy Now — {centsToDisplay(book.price)}
          </button>
          <Link href={`/book/${id}`} className="block text-xs text-[#555] hover:text-[#888] transition-colors">
            View full details
          </Link>
        </div>
      </main>
    </div>
  );
}
