'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { ShieldCheck } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import { getStripe } from '@/lib/stripe/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { giftCheckoutSchema, type GiftResume } from '@/lib/gifts';

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

interface GiftCheckout { bookId: string; price: number; resume?: GiftResume }

function CheckoutForm({ gift }: { gift?: GiftCheckout }) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const { items, getTotal, clearCart } = useCartStore();
  const userProfile = useAuthStore((s) => s.userProfile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const [cardName, setCardName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [detailsLocked, setDetailsLocked] = useState(false);
  const attemptId = useRef<string | null>(null);
  const giftStorageKey = gift && firebaseUser ? `afrobooks-gift-checkout-${firebaseUser.uid}-${gift.bookId}` : null;
  useEffect(() => {
    if (!giftStorageKey) return;
    try {
      const saved = gift?.resume ?? JSON.parse(sessionStorage.getItem(giftStorageKey) || 'null');
      if (saved && typeof saved.attemptId === 'string' && typeof saved.recipientEmail === 'string' && typeof saved.message === 'string') {
        attemptId.current = saved.attemptId;
        setRecipientEmail(saved.recipientEmail); setMessage(saved.message); setDetailsLocked(true);
      }
    } catch { /* A new attempt is saved before a payment can be created. */ }
  }, [giftStorageKey, gift?.resume]);
  const total = gift?.price ?? getTotal();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !userProfile || !firebaseUser) return;
    setError('');
    setLoading(true);

    try {
      if (gift) {
        attemptId.current ??= crypto.randomUUID();
        const parsed = giftCheckoutSchema.safeParse({ recipientEmail, message, attemptId: attemptId.current });
        if (!parsed.success) { setError('Enter a valid recipient email and a message of 1,000 characters or fewer.'); return; }
        // Do not charge if the browser cannot retain the retry identifier.
        sessionStorage.setItem(giftStorageKey!, JSON.stringify({ attemptId: attemptId.current, recipientEmail, message }));
        setDetailsLocked(true);
      }
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: gift ? [{ bookId: gift.bookId }] : items.map((item) => ({ bookId: item.bookId })),
          ...(gift ? { gift: { recipientEmail, message, attemptId: attemptId.current } } : {}),
        }),
      });
      const { clientSecret, orderIds, amount, paymentStatus, error: apiError } = await res.json();
      if (!res.ok || apiError) {
        setError(apiError || 'Unable to start checkout.');
        setLoading(false);
        return;
      }
      if (gift && ['succeeded', 'processing'].includes(paymentStatus)) {
        sessionStorage.removeItem(giftStorageKey!);
        router.push(`/checkout/receipt?orders=${orderIds.join(',')}`);
        return;
      }

      if (amount !== total) {
        setError(`The total has changed to ${centsToDisplay(amount)}. Refresh this page to review it before paying.`);
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
        if (gift) sessionStorage.removeItem(giftStorageKey!);
        else clearCart();
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
      {gift && <>
        <div>
          <label htmlFor="recipientEmail" className="block text-sm text-[#aaa] mb-1.5">Recipient email</label>
          <input id="recipientEmail" type="email" required maxLength={254} value={recipientEmail} disabled={detailsLocked || loading} onChange={e => setRecipientEmail(e.target.value)} placeholder="friend@example.com" className="field-input w-full rounded-lg px-3.5 py-3 text-sm disabled:opacity-70" />
          <p className="text-xs text-[#888] mt-2">They will need to sign in with this email address to claim the book. Please check it carefully.</p>
        </div>
        <div>
          <label htmlFor="giftMessage" className="block text-sm text-[#aaa] mb-1.5">Personal message (optional)</label>
          <textarea id="giftMessage" maxLength={1000} rows={3} value={message} disabled={detailsLocked || loading} onChange={e => setMessage(e.target.value)} placeholder="I thought you would enjoy this book…" className="field-input w-full rounded-lg px-3.5 py-3 text-sm disabled:opacity-70" />
        </div>
        {detailsLocked && <p className="text-xs text-[#aaa]">Your gift details are saved. Retrying this checkout uses the same payment. <Link href="/gifts" className="underline">View My gifts</Link></p>}
      </>}
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

      {error && <p role="alert" className="text-sm text-[#e8442a]">{error}</p>}

      <button
        type="submit"
        disabled={loading || !stripe}
        className="w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
        style={{ background: '#e8442a', color: '#fff' }}
      >
        {loading && <LoadingSpinner size={16} color="#fff" />}
        {gift ? 'Send gift for' : 'Pay'} {centsToDisplay(total)}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-[#444]">
        <ShieldCheck size={12} />
        256-bit SSL · PCI-DSS compliant · Your card is never stored
      </p>
    </form>
  );
}

export default function CheckoutPaymentPanel({ gift }: { gift?: GiftCheckout }) {
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
  if (!available) return <p role="status" className="text-sm leading-relaxed text-[#aaa]">Payments are temporarily unavailable. Please try again later.</p>;
  return (
    <Elements stripe={getStripe()}>
      <CheckoutForm gift={gift} />
    </Elements>
  );
}
