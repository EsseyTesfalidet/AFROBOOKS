'use client';
import { useState } from 'react';
import Link from 'next/link';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { useAuthStore } from '@/store/authStore';
import { authenticatedPost } from '@/lib/firebase/request';

export default function SubscriptionPage() {
  const user = useAuthStore(s => s.userProfile);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try {
      await authenticatedPost('/api/stripe/cancel-subscription', {});
      setMessage('Renewal is cancelled. Your access continues until the end of the current billing period.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to cancel renewal. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-[#0e0e0e]"><BuyerHeader /><main className="max-w-xl mx-auto px-4 py-12 space-y-5 text-white">
    <h1 className="font-display text-3xl">Subscriptions</h1>
    <p className="text-[#aaa]">New subscriptions are currently unavailable. You can browse books, read available previews, and purchase titles individually.</p>
    {user?.subscriptionId && <div className="rounded-xl border border-[#333] p-5 space-y-3">
      <p>Your plan: {user.subscriptionPlan}</p>
      <button type="button" onClick={cancel} disabled={busy} className="rounded-lg bg-[#e8442a] px-4 py-2 disabled:opacity-50">{busy ? 'Cancelling…' : 'Cancel renewal'}</button>
    </div>}
    {!user && <Link href="/login" className="block underline">Sign in to manage an existing subscription</Link>}
    {message && <p role="status">{message}</p>}
    <Link href="/browse" className="block underline">Browse books</Link>
  </main></div>;
}
