'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, ShoppingCart } from 'lucide-react';
import { useCatalog } from '@/hooks/useCatalog';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import BookCover from '@/components/shared/BookCover';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { useCartStore } from '@/store/cartStore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import { useOwnedCart } from '@/hooks/useOwnedCart';
import { cartMinimum } from '@/lib/utils/fees';

export default function CartPage() {
  const router = useRouter();
  const { items, removeItem, getSubtotal, getBundleDiscount, getTotal } = useCartStore();
  const catalog = useCatalog();
  const ownership = useOwnedCart();

  const sub = getSubtotal();
  const bundle = getBundleDiscount();
  const tot = getTotal();
  const minimum = cartMinimum(items.map(item => item.price));

  if (ownership.error) return <div role="alert" className="p-8 text-red-300">{ownership.error} <Link href="/library" className="underline">Open your library</Link></div>;
  if (ownership.loading || catalog.loading || (!catalog.error && items.some(item => !catalog.books.some(book => book.id === item.bookId)))) return <div role="status" className="flex justify-center py-20"><LoadingSpinner size={28} /><span className="sr-only">Checking book availability…</span></div>;
  if (catalog.error) return <div role="alert" className="p-8 text-[14px] text-red-300">{catalog.error}<button type="button" onClick={catalog.retry} className="ml-4 min-h-11 underline">Try again</button></div>;

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#0e0e0e]">
        <BuyerHeader />
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <ShoppingCart size={48} style={{ color: '#2a2a2a' }} className="mb-4" />
          <p className="text-lg font-display text-white mb-2">Your cart is empty</p>
          <p className="text-sm text-[#555] mb-6">Browse books to get started.</p>
          <Link href="/library" className="mb-4 text-sm text-[#f5b800] underline">Already purchased? Open your library</Link>
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
                <div className="w-10 shrink-0"><BookCover book={item} compact /></div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.title}</p>
                  <p className="text-xs text-[#666]">{item.authorName}</p>
                </div>

                <p className="text-sm font-medium flex-shrink-0" style={{ color: '#f5b800' }}>
                  {centsToDisplay(item.price)}
                </p>

                <button type="button" aria-label={`Remove ${item.title} from cart`} onClick={() => removeItem(item.bookId)} className="p-1.5 rounded-lg hover:bg-[#1a1a1a] transition-colors flex-shrink-0">
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
              </div>

              <div className="border-t pt-3" style={{ borderColor: '#222' }}>
                <div className="flex justify-between font-medium">
                  <span className="text-[#f5f2eb]">Total</span>
                  <span className="font-display text-xl" style={{ color: '#f5b800' }}>{centsToDisplay(tot)}</span>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-[#aaa]">Platform and payment processing fees are included in the book prices.</p>
              {minimum.remaining > 0 && <p role="status" className="text-sm leading-relaxed text-[#f5b800]">Add {centsToDisplay(minimum.remaining)} more after discounts to reach the {centsToDisplay(minimum.minimum)} cart minimum. You pay once for all your titles. <Link href="/browse" className="underline">Choose more stories</Link></p>}
              {items.length > 20 && <p role="status" className="text-sm text-[#f5b800]">Choose up to 20 titles per payment.</p>}

              <button
                type="button"
                disabled={minimum.remaining > 0 || items.length > 20}
                onClick={() => router.push('/checkout')}
                className="w-full py-3 rounded-xl text-sm font-medium disabled:opacity-50"
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
