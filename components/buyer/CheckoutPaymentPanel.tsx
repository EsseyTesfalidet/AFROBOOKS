'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { ShieldCheck } from 'lucide-react';
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
  const { items, getTotal, clearCart } = useCartStore();
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
          items: items.map((item) => ({ bookId: item.bookId })),
        }),
      });
      const { clientSecret, orderIds, amount, error: apiError } = await res.json();
      if (apiError) {
        setError(apiError);
        setLoading(false);
        return;
      }

      if (amount !== total) {
        setError(`The total has changed to ${centsToDisplay(amount)}. Refresh your cart before paying.`);
        return;
      }
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

export default function CheckoutPaymentPanel() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (!/^pk_(live|test)_/.test(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')) { setAvailable(false); return; }
    fetch('/api/stripe/status', { cache: 'no-store' }).then(response => response.ok ? response.json() : null)
      .then(data => { if (active) setAvailable(data?.available === true); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);
  if (available === null) return <div role="status" className="flex justify-center gap-3 py-6 text-sm text-[#aaa]"><LoadingSpinner size={20} />Checking payment availability…</div>;
  if (!available) return <p role="status" className="text-sm leading-relaxed text-[#aaa]">Payments are temporarily unavailable. Your books are still in your cart. Please try again later.</p>;
  return (
    <Elements stripe={getStripe()}>
      <CheckoutForm />
    </Elements>
  );
}
