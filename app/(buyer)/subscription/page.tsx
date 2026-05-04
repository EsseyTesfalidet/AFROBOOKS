'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Check } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { getStripe } from '@/lib/stripe/client';
import { useAuthStore } from '@/store/authStore';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

const PLANS = [
  {
    id: 'basic', name: 'Basic', price: 499, label: '$4.99/month',
    features: ['500+ ebooks', 'Unlimited reading', 'Basic genres only', 'New releases excluded'],
    featured: false, btnStyle: { border: '1px solid #333', color: '#aaa', background: 'transparent' },
  },
  {
    id: 'standard', name: 'Standard', price: 999, label: '$9.99/month',
    features: ['2,000+ ebooks', 'All genres', 'New releases after 30 days', 'Priority support'],
    featured: true, btnStyle: { background: '#e8442a', color: '#fff' },
  },
  {
    id: 'premium', name: 'Premium', price: 1499, label: '$14.99/month',
    features: ['ALL ebooks', 'All genres', 'Day-one new releases', 'Early access to drafts'],
    featured: false, btnStyle: { background: '#f5b800', color: '#000' },
  },
];

function PaymentModal({ plan, onClose }: { plan: typeof PLANS[0]; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const userProfile = useAuthStore((s) => s.userProfile);
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !userProfile) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/stripe/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.id, userId: userProfile.uid }),
      });
      const { clientSecret } = await res.json();
      if (!clientSecret) { setError('Could not initialize payment.'); setLoading(false); return; }

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return;

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement },
      });

      if (result.error) {
        setError(result.error.message ?? 'Payment failed.');
      } else {
        router.push('/browse');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/70 p-4">
      <div className="w-full max-w-md p-6 rounded-2xl border" style={{ background: '#111', borderColor: '#222' }}>
        <h2 className="font-display text-display-sm text-white mb-1">Subscribe to {plan.name}</h2>
        <p className="text-sm text-[#666] mb-5">{plan.label} · Cancel anytime</p>
        <form onSubmit={handleSubscribe} className="space-y-4">
          <div className="px-3.5 py-3 rounded-lg border" style={{ background: '#1a1a1a', borderColor: '#333' }}>
            <CardElement options={{ style: { base: { color: '#f5f2eb', fontSize: '14px', '::placeholder': { color: '#444' } } } }} />
          </div>
          {error && <p className="text-sm text-[#e8442a]">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl text-sm border" style={{ borderColor: '#333', color: '#aaa' }}>Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2" style={plan.btnStyle}>
              {loading && <LoadingSpinner size={14} color="currentColor" />}
              Subscribe
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  const userProfile = useAuthStore((s) => s.userProfile);
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[0] | null>(null);
  const isSubscribed = userProfile?.subscriptionStatus === 'active';

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="font-display text-display-xl text-white">Read More. Pay Less.</h1>
          <p className="text-sm text-[#666] mt-2">Get unlimited access to thousands of ebooks by African authors.</p>
        </div>

        {isSubscribed && (
          <div className="mb-8 p-4 rounded-xl text-center" style={{ background: '#0f2e1a', border: '1px solid #1a4a2a' }}>
            <p className="text-sm font-medium" style={{ color: '#4ade80' }}>
              You're subscribed to the {userProfile?.subscriptionPlan} plan.
            </p>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {PLANS.map((plan) => (
            <div key={plan.id} className="relative rounded-2xl border p-6 flex flex-col"
              style={{ background: '#111', border: plan.featured ? '2px solid #e8442a' : '1px solid #1a1a1a' }}>
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#e8442a', color: '#fff' }}>
                    Most Popular
                  </span>
                </div>
              )}
              <h3 className="font-display text-display-sm text-white mb-1">{plan.name}</h3>
              <p className="font-display text-3xl mb-4" style={{ color: '#f5b800' }}>
                ${(plan.price / 100).toFixed(2)}<span className="text-sm font-body text-[#666]">/mo</span>
              </p>
              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#aaa]">
                    <Check size={13} style={{ color: '#4ade80', marginTop: 2, flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setSelectedPlan(plan)}
                disabled={isSubscribed}
                className="w-full py-3 rounded-xl text-sm font-medium disabled:opacity-50"
                style={plan.btnStyle}>
                Subscribe{plan.featured ? ` — ${plan.label}` : ''}
              </button>
            </div>
          ))}
        </div>

        {/* Comparison table */}
        <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
          <table className="w-full text-sm min-w-[400px]">
            <thead>
              <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                <th className="px-5 py-3 text-left text-xs text-[#555] uppercase tracking-wider">Feature</th>
                {PLANS.map((p) => <th key={p.id} className="px-4 py-3 text-center text-xs text-[#555] uppercase tracking-wider">{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                ['Ebooks available', '500+', '2,000+', 'All'],
                ['All genres', '—', 'Yes', 'Yes'],
                ['New releases', 'Excluded', 'After 30 days', 'Day one'],
                ['Early draft access', '—', '—', 'Yes'],
                ['Cancel anytime', 'Yes', 'Yes', 'Yes'],
              ].map(([feature, ...vals]) => (
                <tr key={feature as string} style={{ borderBottom: '1px solid #111' }}>
                  <td className="px-5 py-3 text-[#888]">{feature}</td>
                  {vals.map((v, i) => (
                    <td key={i} className="px-4 py-3 text-center" style={{ color: v === '—' ? '#333' : '#f5f2eb' }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {selectedPlan && (
        <Elements stripe={getStripe()}>
          <PaymentModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
        </Elements>
      )}
    </div>
  );
}
