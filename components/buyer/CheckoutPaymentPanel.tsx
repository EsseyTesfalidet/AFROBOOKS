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
import { appFetch } from '@/lib/network';
import { useConnectionRecovery } from '@/hooks/useConnectionRecovery';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useInstalledApp } from '@/hooks/useInstalledApp';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#f5f2eb',
      fontFamily: '"DM Sans", sans-serif',
      fontSize: '16px',
      '::placeholder': { color: '#444' },
    },
    invalid: { color: '#e8442a' },
  },
};

interface GiftCheckout { bookId: string; price: number; resume?: GiftResume }

function CheckoutForm({ gift }: { gift?: GiftCheckout }) {
  const installed = useInstalledApp();
  const appTheme = useAppTheme();
  const cardOptions = installed && appTheme === 'light' ? { ...CARD_ELEMENT_OPTIONS, style: { ...CARD_ELEMENT_OPTIONS.style,
    base: { ...CARD_ELEMENT_OPTIONS.style.base, color: '#25272c', '::placeholder': { color: '#666b76' } } } } : CARD_ELEMENT_OPTIONS;
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const { items, getTotal, clearCart, removeItem } = useCartStore();
  const userProfile = useAuthStore((s) => s.userProfile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const [cardName, setCardName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [detailsLocked, setDetailsLocked] = useState(false);
  const attemptId = useRef<string | null>(null);
  const busy = useRef(false);
  const [pendingOrders, setPendingOrders] = useState<string[]>([]);
  const [recovering, setRecovering] = useState(false);
  const recoveryBusy = useRef(false);
  const [restored, setRestored] = useState(false);
  const pendingKey = firebaseUser ? `afrobooks-pending-payment-${firebaseUser.uid}-${gift?.bookId ?? 'cart'}` : null;
  useEffect(() => {
    if (!pendingKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
      if (Array.isArray(saved) && saved.length > 0 && saved.length <= 20 && saved.every(id => typeof id === 'string' && /^[^/]{1,128}$/.test(id))) setPendingOrders(saved);
    } catch { /* Confirmation requires a saved recovery reference. */ }
    setRestored(true);
  }, [pendingKey]);

  async function checkPayment() {
    if (!firebaseUser || !pendingOrders.length || recoveryBusy.current || busy.current) return;
    recoveryBusy.current = true; setRecovering(true); setError('');
    try {
      const response = await appFetch('/api/stripe/recover-purchase', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await firebaseUser.getIdToken()}` },
        body: JSON.stringify({ orderIds: pendingOrders }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.state === 'retryable') {
        sessionStorage.removeItem(pendingKey!); setPendingOrders([]);
        setError('Your payment is not completed. You can retry using the same checkout.');
      } else if (result.state === 'pending' || result.state === 'review') {
        sessionStorage.removeItem(pendingKey!);
        router.push(`/checkout/receipt?orders=${pendingOrders.map(encodeURIComponent).join(',')}`);
      } else throw new Error('Payment status unavailable.');
    } catch {
      setError('We could not check your payment yet. Reconnect and check its status before paying again.');
    } finally { recoveryBusy.current = false; setRecovering(false); }
  }
  useConnectionRecovery(() => { if (pendingOrders.length) void checkPayment(); });
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
    if (!stripe || !elements || !userProfile || !firebaseUser || busy.current || !restored) return;
    if (pendingOrders.length) { void checkPayment(); return; }
    busy.current = true;
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
      const res = await appFetch('/api/stripe/create-payment-intent', {
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
      const { clientSecret, orderIds, amount, paymentStatus, error: apiError, code, ownedBookIds } = await res.json();
      if (!res.ok || apiError) {
        if (!gift && code === 'BOOK_ALREADY_OWNED') {
          for (const id of ownedBookIds ?? []) removeItem(id);
          router.push('/library');
          return;
        }
        if (code === 'PAYMENT_PENDING' && orderIds?.length) {
          router.push(`/checkout/receipt?orders=${orderIds.join(',')}`);
          return;
        }
        setError(apiError || 'Unable to start checkout.');
        setLoading(false);
        return;
      }
      if (['succeeded', 'processing'].includes(paymentStatus)) {
        if (gift) sessionStorage.removeItem(giftStorageKey!);
        else clearCart();
        router.push(`/checkout/receipt?orders=${orderIds.join(',')}`);
        return;
      }

      if (amount !== total) {
        setError(`The total has changed to ${centsToDisplay(amount)}. Refresh this page to review it before paying.`);
        return;
      }
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return;

      // Keep order references only, never card data or a client secret.
      try { sessionStorage.setItem(pendingKey!, JSON.stringify(orderIds)); }
      catch { setError('Enable browser storage before paying so an interrupted payment can be recovered.'); return; }
      setPendingOrders(orderIds);

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement, billing_details: { name: cardName } },
      });

      if (result.error) {
        setError(`${result.error.message ?? 'Payment confirmation was interrupted.'} Check payment status before trying again.`);
      } else {
        sessionStorage.removeItem(pendingKey!);
        if (gift) sessionStorage.removeItem(giftStorageKey!);
        else clearCart();
        router.push(`/checkout/receipt?orders=${orderIds.join(',')}`);
      }
    } catch {
      setError('Checkout was interrupted. Your details are still here. Reconnect and retry; the existing checkout will be checked first.');
    } finally {
      busy.current = false;
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
          autoComplete="cc-name"
          enterKeyHint="next"
          value={cardName}
          onChange={(e) => setCardName(e.target.value)}
          required
          placeholder="Name on card"
          className="w-full px-3.5 py-3 rounded-lg border text-sm"
          style={{ background: 'var(--app-field, #1a1a1a)', borderColor: 'var(--app-line, #333)', color: 'var(--app-text, #f5f2eb)' }}
        />
      </div>

      <div>
        <label className="block text-sm text-[#aaa] mb-1.5">Card Details</label>
        <div className="px-3.5 py-3 rounded-lg border" style={{ background: 'var(--app-field, #1a1a1a)', borderColor: 'var(--app-line, #333)' }}>
          <CardElement options={cardOptions} />
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-[#e8442a]">{error}</p>}
      {!!pendingOrders.length && <div className="rounded-xl border border-[#555] p-3 text-sm text-[#ddd]">
        <p role="status">An existing payment needs to be checked. Checking its status does not charge your card.</p>
        <button type="button" onClick={() => void checkPayment()} disabled={loading || recovering} className="mt-2 min-h-11 text-[#f5b800] disabled:opacity-50">{recovering ? 'Checking payment…' : 'Check payment status'}</button>
        <Link href={`/checkout/receipt?orders=${pendingOrders.map(encodeURIComponent).join(',')}`} className="ml-4 inline-flex min-h-11 items-center underline">View order</Link>
      </div>}

      <button
        type="submit"
        disabled={loading || !stripe || !restored || pendingOrders.length > 0}
        className="app-primary-action w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
        style={{ background: 'var(--app-action, #e8442a)', color: 'var(--app-on-action, #fff)' }}
      >
        {loading && <LoadingSpinner size={16} color="var(--app-on-action, #fff)" />}
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
  const [retry, setRetry] = useState(0);
  const uid = useAuthStore(state => state.firebaseUser?.uid);
  useConnectionRecovery(() => { if (available !== true) { setAvailable(null); setRetry(value => value + 1); } });
  useEffect(() => {
    let active = true;
    if (!/^pk_(live|test)_/.test(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')) { setAvailable(false); return; }
    appFetch('/api/stripe/status', { cache: 'no-store' }).then(response => response.ok ? response.json() : null)
      .then(data => { if (active) setAvailable(data?.available === true); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, [retry]);
  if (available === null) return <div role="status" className="flex justify-center gap-3 py-6 text-sm text-[#aaa]"><LoadingSpinner size={20} />Checking payment availability…</div>;
  if (!available) return <div className="text-sm leading-relaxed text-[#aaa]"><p role="status">Unable to load payments. Check your connection and retry.</p><button type="button" className="mt-2 min-h-11 text-[#f5b800]" onClick={() => { setAvailable(null); setRetry(value => value + 1); }}>Retry</button></div>;
  return (
    <Elements stripe={getStripe()}>
      <CheckoutForm key={`${uid}:${gift?.bookId ?? 'cart'}`} gift={gift} />
    </Elements>
  );
}
