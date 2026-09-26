'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { useCartStore } from '@/store/cartStore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useCatalog } from '@/hooks/useCatalog';

const CheckoutPaymentPanel = dynamic(() => import('@/components/buyer/CheckoutPaymentPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-6">
      <LoadingSpinner size={24} />
    </div>
  ),
});

export default function CheckoutPage() {
  const { items, getBundleDiscount, getTotal } = useCartStore();
  const catalog = useCatalog();
  const router = useRouter();
  const bundle = getBundleDiscount();
  const tot = getTotal();

  useEffect(() => {
    if (items.length === 0) {
      router.replace('/cart');
    }
  }, [items.length, router]);

  if (items.length === 0) return null;
  if (catalog.loading || (!catalog.error && items.some(item => !catalog.books.some(book => book.id === item.bookId)))) return <div role="status" className="flex justify-center py-20"><LoadingSpinner size={28} /><span className="sr-only">Checking book availability…</span></div>;
  if (catalog.error) return <div role="alert" className="p-8 text-[14px] text-red-300">{catalog.error}<button type="button" onClick={catalog.retry} className="ml-4 min-h-11 underline">Try again</button></div>;

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="max-w-xl mx-auto px-4 py-8">
        {/* Steps */}
        <div className="flex items-center justify-center gap-2 mb-8 text-xs text-[#555]">
          {['Browse', 'Cart', 'Payment', 'Read'].map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              {i > 0 && <span>›</span>}
              <span style={{ color: i === 2 ? '#f5f2eb' : '#555' }}>{step}</span>
            </span>
          ))}
        </div>

        <div className="space-y-5">
          {/* Order summary */}
          <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <h2 className="font-display text-display-sm text-white mb-4">Order Summary</h2>
            {items.map((item) => (
              <div key={item.bookId} className="flex justify-between text-sm py-1.5">
                <span className="text-[#ccc] truncate mr-4">{item.title}</span>
                <span style={{ color: '#f5b800' }}>{centsToDisplay(item.price)}</span>
              </div>
            ))}
            <div className="border-t mt-3 pt-3 space-y-1 text-sm" style={{ borderColor: '#222' }}>
              {bundle > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: '#4ade80' }}>Bundle discount</span>
                  <span style={{ color: '#4ade80' }}>-{centsToDisplay(bundle)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium pt-1">
                <span className="text-white">Total</span>
                <span className="font-display text-xl" style={{ color: '#f5b800' }}>{centsToDisplay(tot)}</span>
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <h2 className="font-display text-display-sm text-white mb-4">Payment</h2>
            <CheckoutPaymentPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
