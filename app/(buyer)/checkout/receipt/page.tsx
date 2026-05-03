'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle } from 'lucide-react';
import Link from 'next/link';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { getBook } from '@/lib/firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';
import type { Order } from '@/types/order';

function ReceiptContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderIds = searchParams.get('orders')?.split(',') ?? [];
  const [orders, setOrders] = useState<Order[]>([]);
  const [books, setBooks] = useState<Record<string, Book>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderIds.length) { router.replace('/library'); return; }

    Promise.all(
      orderIds.map((id) => getDoc(doc(db, 'orders', id)).then((s) => s.data() as Order))
    ).then(async (orderData) => {
      setOrders(orderData.filter(Boolean));
      const bookMap: Record<string, Book> = {};
      for (const order of orderData.filter(Boolean)) {
        const b = await getBook(order.bookId);
        if (b) bookMap[order.bookId] = b;
      }
      setBooks(bookMap);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="flex justify-center pt-16">
      <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#222', borderTopColor: '#e8442a' }} />
    </div>
  );

  const total = orders.reduce((s, o) => s + o.finalPrice, 0);

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <div className="rounded-2xl border overflow-hidden" style={{ background: '#111', borderColor: '#1a1a1a' }}>
        <div className="px-6 py-8 text-center" style={{ background: '#0f2e1a' }}>
          <CheckCircle size={40} style={{ color: '#4ade80' }} className="mx-auto mb-3" />
          <h1 className="font-display text-display-lg" style={{ color: '#4ade80' }}>Payment Successful!</h1>
          <p className="text-sm mt-1" style={{ color: '#4ade80', opacity: 0.7 }}>Your books are ready to read.</p>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-3">
            {orders.map((order) => {
              const book = books[order.bookId];
              return (
                <div key={order.id} className="flex items-center gap-3">
                  <div className="w-8 h-10 rounded flex-shrink-0" style={{ background: book?.coverBgColor ?? '#1a1040' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{order.bookTitle}</p>
                    <p className="text-xs text-[#666]">{book?.authorName}</p>
                  </div>
                  <span className="text-sm font-medium" style={{ color: '#f5b800' }}>
                    {centsToDisplay(order.finalPrice)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="border-t pt-4 flex justify-between items-center" style={{ borderColor: '#222' }}>
            <span className="text-sm text-[#aaa]">Total charged</span>
            <span className="font-display text-xl" style={{ color: '#f5b800' }}>{centsToDisplay(total)}</span>
          </div>

          <p className="text-xs text-center text-[#555]">A receipt has been sent to your email.</p>

          <div className="flex gap-3">
            {orders.length === 1 && (
              <Link
                href={`/read/${orders[0].bookId}`}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-center"
                style={{ background: '#e8442a', color: '#fff' }}
              >
                Start Reading
              </Link>
            )}
            <Link
              href="/library"
              className="flex-1 py-3 rounded-xl text-sm font-medium text-center border"
              style={{ borderColor: '#333', color: '#aaa' }}
            >
              My Library
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ReceiptPage() {
  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <Suspense fallback={
        <div className="flex justify-center pt-16">
          <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#222', borderTopColor: '#e8442a' }} />
        </div>
      }>
        <ReceiptContent />
      </Suspense>
    </div>
  );
}
