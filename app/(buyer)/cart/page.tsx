'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, ShoppingCart } from 'lucide-react';
import Image from 'next/image';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { useCartStore } from '@/store/cartStore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';

export default function CartPage() {
  const router = useRouter();
  const { items, removeItem, discountAmount, getSubtotal, getBundleDiscount, getTotal } = useCartStore();

  const sub = getSubtotal();
  const bundle = getBundleDiscount();
  const promoDiscount = discountAmount;
  const tot = getTotal();

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#0e0e0e]">
        <BuyerHeader />
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <ShoppingCart size={48} style={{ color: '#2a2a2a' }} className="mb-4" />
          <p className="text-lg font-display text-white mb-2">Your cart is empty</p>
          <p className="text-sm text-[#555] mb-6">Browse books to get started.</p>
          <Link href="/browse" className="px-6 py-2.5 rounded-lg text-sm font-medium" style={{ background: '#e8442a', color: '#fff' }}>
            Browse Books
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="font-display text-display-lg text-white mb-6">Your Cart</h1>

        <div className="flex gap-6 flex-col lg:flex-row">
          {/* Items */}
          <div className="flex-1 space-y-3">
            {items.map((item) => (
              <div key={item.bookId} className="flex items-center gap-4 p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                {/* Mini cover */}
                <div
                  className="rounded-lg overflow-hidden flex-shrink-0 relative"
                  style={{ width: 36, height: 46, background: item.coverBgColor }}
                >
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ background: item.coverAccentColor }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.title}</p>
                  <p className="text-xs text-[#666]">{item.authorName}</p>
                </div>

                <p className="text-sm font-medium flex-shrink-0" style={{ color: '#f5b800' }}>
                  {centsToDisplay(item.price)}
                </p>

                <button type="button" onClick={() => removeItem(item.bookId)} className="p-1.5 rounded-lg hover:bg-[#1a1a1a] transition-colors flex-shrink-0">
                  <Trash2 size={14} style={{ color: '#666' }} />
                </button>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="p-5 rounded-xl border space-y-3" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <h2 className="font-display text-display-sm text-white">Order Summary</h2>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#888]">Subtotal ({items.length} book{items.length !== 1 ? 's' : ''})</span>
                  <span className="text-[#f5f2eb]">{centsToDisplay(sub)}</span>
                </div>
                {bundle > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: '#4ade80' }}>Bundle discount (5%)</span>
                    <span style={{ color: '#4ade80' }}>-{centsToDisplay(bundle)}</span>
                  </div>
                )}
                {promoDiscount > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: '#4ade80' }}>Promo code</span>
                    <span style={{ color: '#4ade80' }}>-{centsToDisplay(promoDiscount)}</span>
                  </div>
                )}
              </div>

              <div className="border-t pt-3" style={{ borderColor: '#222' }}>
                <div className="flex justify-between font-medium">
                  <span className="text-[#f5f2eb]">Total</span>
                  <span className="font-display text-xl" style={{ color: '#f5b800' }}>{centsToDisplay(tot)}</span>
                </div>
              </div>

              {items.length >= 3 && bundle === 0 && (
                <p className="text-xs text-center" style={{ color: '#4ade80' }}>5% bundle discount applied!</p>
              )}

              <button
                type="button"
                onClick={() => router.push('/checkout')}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ background: '#e8442a', color: '#fff' }}
              >
                Checkout — {centsToDisplay(tot)}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
