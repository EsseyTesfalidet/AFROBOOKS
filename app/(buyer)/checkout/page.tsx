'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { ShieldCheck } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import { getStripe } from '@/lib/stripe/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#f5f2eb',
      fontFamily: '"DM Sans", sans-serif',
      fontSize: '14px',
      '::placeholder': { color: '#444' },
    },
    invalid: { color: '#e8442a' },
  },
};

function CheckoutForm() {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const { items, promoCode, promoBookId, discountAmount, getTotal, clearCart } = useCartStore();
  const userProfile = useAuthStore((s) => s.userProfile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const [cardName, setCardName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const total = getTotal();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !userProfile || !firebaseUser) return;
    setError('');
    setLoading(true);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: items.map((i) => ({ bookId: i.bookId })),
          promoCode,
          promoBookId,
          discountAmount,
        }),
      });
      const { clientSecret, orderIds, error: apiError } = await res.json();
      if (apiError) { setError(apiError); setLoading(false); return; }

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return;

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement, billing_details: { name: cardName } },
      });

      if (result.error) {
        setError(result.error.message ?? 'Payment failed.');
      } else {
        clearCart();
        router.push(`/checkout/receipt?orders=${orderIds.join(',')}`);
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="cardName" className="block text-sm text-[#aaa] mb-1.5">Cardholder Name</label>
        <input
          id="cardName"
          type="text"
          value={cardName}
          onChange={(e) => setCardName(e.target.value)}
          required
          placeholder="Name on card"
          className="w-full px-3.5 py-3 rounded-lg border text-sm"
          style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}
        />
      </div>

      <div>
        <label className="block text-sm text-[#aaa] mb-1.5">Card Details</label>
        <div className="px-3.5 py-3 rounded-lg border" style={{ background: '#1a1a1a', borderColor: '#333' }}>
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
      </div>

      {error && <p className="text-sm text-[#e8442a]">{error}</p>}

      <button
        type="submit"
        disabled={loading || !stripe}
        className="w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
        style={{ background: '#e8442a', color: '#fff' }}
      >
        {loading && <LoadingSpinner size={16} color="#fff" />}
        Pay {centsToDisplay(total)}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-[#444]">
        <ShieldCheck size={12} />
        256-bit SSL · PCI-DSS compliant · Your card is never stored
      </p>
    </form>
  );
}

export default function CheckoutPage() {
  const { items, getSubtotal, getBundleDiscount, promoCode, discountAmount, getTotal } = useCartStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const sub = getSubtotal();
  const bundle = getBundleDiscount();
  const tot = getTotal();

  useEffect(() => { setMounted(true); }, []);

  if (items.length === 0) { router.replace('/cart'); return null; }

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
              {discountAmount > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: '#4ade80' }}>Promo: {promoCode}</span>
                  <span style={{ color: '#4ade80' }}>-{centsToDisplay(discountAmount)}</span>
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
            {mounted && (
              <Elements stripe={getStripe()}>
                <CheckoutForm />
              </Elements>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
