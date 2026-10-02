'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { db } from '@/lib/firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import { receiptStatus } from '@/lib/utils/receiptStatus';
import { getBook } from '@/lib/firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';
import type { Order } from '@/types/order';
import { appFetch } from '@/lib/network';
import { useConnectionRecovery } from '@/hooks/useConnectionRecovery';

function ReceiptContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderKey = searchParams.get('orders') ?? '';
  const orderIds = [...new Set(orderKey.split(',').filter(Boolean))];
  const { firebaseUser, loading: authLoading } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [books, setBooks] = useState<Record<string, Book>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [confirmationError, setConfirmationError] = useState('');
  useConnectionRecovery(() => setAttempt(value => value + 1));
  const confirmationFinished = orders.length > 0 && orders.length === orderIds.length && orders.every(order => order.status !== 'pending');

  useEffect(() => {
    const ids = [...new Set(orderKey.split(',').filter(Boolean))];
    if (confirmationFinished || !firebaseUser || !ids.length || ids.length > 20 || ids.some(id => id.includes('/'))) return;
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function confirm() {
      try {
        const token = await firebaseUser!.getIdToken();
        if (!active) return;
        const response = await appFetch('/api/stripe/confirm-purchase', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ orderIds: ids }) });
        if (!response.ok) throw new Error('Not confirmed');
        if (active) setConfirmationError('');
      } catch { if (active) setConfirmationError('We could not check your payment yet. Reconnect and retry this status check; please do not pay again.'); }
      if (active && ++attempts < 6) timer = setTimeout(confirm, 10000);
    }
    void confirm();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [orderKey, firebaseUser?.uid, confirmationFinished, attempt]);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { router.replace(`/login?redirect=${encodeURIComponent(`/checkout/receipt?orders=${orderKey}`)}`); return; }
    const ids = [...new Set(orderKey.split(',').filter(Boolean))];
    if (!ids.length) { router.replace('/library'); return; }
    if (ids.length > 20 || ids.some(id => id.includes('/'))) { setError('Invalid receipt link.'); setLoading(false); return; }
    let active = true;
    const current = new Map<string, Order>();
    setOrders([]); setLoading(true); setError('');
    const unsubscribe = ids.map(id => onSnapshot(doc(db, 'orders', id), { includeMetadataChanges: true }, snapshot => {
      if (!active) return;
      if (!snapshot.exists() && snapshot.metadata.fromCache) return;
      if (!snapshot.exists() || snapshot.data().buyerId !== firebaseUser.uid) {
        setError('This receipt is unavailable for your account.'); setLoading(false); return;
      }
      const order = { ...snapshot.data(), id: snapshot.id } as Order;
      current.set(id, order);
      setOrders(ids.flatMap(key => current.has(key) ? [current.get(key)!] : []));
      setLoading(current.size !== ids.length);
      getBook(order.bookId).then(book => { if (active && book) setBooks(prev => ({ ...prev, [book.id]: book })); }).catch(() => {});
    }, () => { if (active) { setError('Unable to confirm your order. Reload this page or check your library.'); setLoading(false); } }));
    return () => { active = false; unsubscribe.forEach(stop => stop()); };
  }, [orderKey, firebaseUser?.uid, authLoading, router, attempt]);

  if (loading) return (
    <div className="flex flex-col items-center gap-4 px-4 pt-16 text-center text-sm text-[#bbb]">
      <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#222', borderTopColor: '#e8442a' }} />
      <p role="status">{confirmationError || 'Checking your order. Please do not pay again.'}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 text-[#f5b800]">Retry status check</button>
    </div>
  );

  const total = orders.reduce((s, o) => s + o.finalPrice, 0);
  const status = receiptStatus(orderIds.length, orders);
  const completed = !error && status === 'completed';
  const refunded = !error && orders.length === orderIds.length && orders.every(order => order.status === 'refunded');
  const needsReview = orders.some(order => order.status === 'needs_review');
  const isGift = orders.some(order => !!order.giftId);
  const StatusIcon = completed ? CheckCircle : Clock;

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <div className="rounded-2xl border overflow-hidden" style={{ background: '#111', borderColor: '#1a1a1a' }}>
        <div className="px-6 py-8 text-center" style={{ background: '#0f2e1a' }}>
          <StatusIcon size={40} style={{ color: completed ? '#4ade80' : '#f5b800' }} className="mx-auto mb-3" />
          <h1 className="font-display text-display-lg text-white">{refunded ? 'Purchase refunded' : completed ? isGift ? 'Gift purchased' : 'Purchase confirmed' : error || status === 'unavailable' ? 'Order needs attention' : 'Confirming your purchase'}</h1>
          <p role="status" className="text-sm mt-2 text-[#aaa]">{error || (refunded ? 'This payment was refunded. These orders no longer provide reading access. Any other valid copies remain in your library.' : needsReview ? 'Your payment has been recorded for staff review. Please do not pay again.' : completed ? isGift ? 'Your gift is ready to claim. Check My gifts for email status and to share the claim link.' : 'Your purchase has been recorded. Available books can be opened from your library.' : status === 'unavailable' ? 'Check your order status before trying to read.' : 'Payment is still being confirmed. This page updates automatically; please do not pay again.')}</p>
        </div>

        <div className="p-6 space-y-5">
          {!confirmationFinished && <div className="text-sm text-[#bbb]">
            {confirmationError && <p role="status">{confirmationError}</p>}
            <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 text-[#f5b800]">Retry status check</button>
          </div>}
          <div className="space-y-3">
            {orders.map((order) => {
              const book = books[order.bookId];
              return (
                <div key={order.id} className="flex items-center gap-3">
                  <div className="w-8 h-10 rounded flex-shrink-0" style={{ background: book?.coverBgColor ?? '#1a1040' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{order.bookTitle}</p>
                    <p className="text-xs text-[#666]">{book?.authorName}</p>
                    <p className="text-xs text-[#aaa]">{order.status.replaceAll('_', ' ')}{order.refundStatus && order.refundStatus !== 'full' ? ` · Refund ${order.refundStatus}` : ''}</p>
                  </div>
                  <span className="text-sm font-medium" style={{ color: '#f5b800' }}>
                    {centsToDisplay(order.finalPrice)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="border-t pt-4 flex justify-between items-center" style={{ borderColor: '#222' }}>
            <span className="text-sm text-[#aaa]">{refunded ? 'Total refunded' : completed ? 'Total charged' : 'Order total'}</span>
            <span className="font-display text-xl" style={{ color: '#f5b800' }}>{centsToDisplay(total)}</span>
          </div>

          {completed && <p className="text-xs text-center text-[#888]">{orders.every(order => order.receiptEmailSent) ? 'A receipt has been sent to your email.' : 'Your receipt is available here. Email delivery has not been confirmed.'}</p>}

          <div className="flex gap-3">
            {completed && !isGift && orders.length === 1 && books[orders[0].bookId] && (
              <Link
                href={`/read/${orders[0].bookId}`}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-center"
                style={{ background: '#e8442a', color: '#fff' }}
              >
                Start Reading
              </Link>
            )}
            <Link
              href={isGift ? '/gifts' : '/library'}
              className="flex-1 py-3 rounded-xl text-sm font-medium text-center border"
              style={{ borderColor: '#333', color: '#aaa' }}
            >
              {isGift ? 'My gifts' : 'My Library'}
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
