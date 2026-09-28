'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, CircleAlert, Clock3, Wallet } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useSellerDrawerStore } from '@/store/profileDrawerStore';
import type { PayoutSetupState } from '@/functions/src/stripe/payoutSetupState';

interface SetupStatus {
  ready: boolean;
  setupState: PayoutSetupState;
  payoutHold: boolean;
}

export default function AuthorPaymentSetupCard({ hasPublishedBooks }: { hasPublishedBooks: boolean }) {
  const user = useAuthStore(state => state.firebaseUser);
  const uid = useAuthStore(state => state.userProfile?.uid);
  const payoutsOpen = useSellerDrawerStore(state => state.isOpen && state.section === 'payout');
  const [result, setResult] = useState<{ uid: string; status: SetupStatus | null; error: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user || user.uid !== uid || payoutsOpen) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const token = await user!.getIdToken();
        const response = await fetch('/api/stripe/connect?view=setup', {
          cache: 'no-store', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Unable to check payment setup');
        const status = await response.json() as SetupStatus;
        if (typeof status.ready !== 'boolean' || !['needs_setup', 'needs_details', 'reviewing', 'ready', 'unavailable'].includes(status.setupState)) {
          throw new Error('Unknown payment setup status');
        }
        if (!controller.signal.aborted) setResult({ uid: user!.uid, status, error: false });
      } catch {
        if (!controller.signal.aborted) setResult({ uid: user!.uid, status: null, error: true });
      } finally {
        pending = false;
      }
    }
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.removeEventListener('focus', refresh); };
  }, [user, uid, payoutsOpen, attempt]);

  if (!uid || user?.uid !== uid || result?.uid !== uid) return null;
  const status = result.status;
  if (status?.ready && !status.payoutHold) return null;

  const held = status?.payoutHold;
  const reviewing = status?.setupState === 'reviewing';
  const restricted = status?.setupState === 'unavailable';
  const needsHelp = held || restricted;
  const title = result.error ? 'Payment setup status is unavailable'
    : held ? 'Your payments need review'
      : reviewing ? 'Stripe is reviewing your details'
        : restricted ? 'Your Stripe account needs attention'
          : 'Finish setting up your author payments';
  const message = result.error ? 'We could not check your payment setup. Try again or open Payouts for more information.'
    : held ? 'Purchases and further earnings transfers are on hold. Open Payouts for details and contact support for help.'
      : reviewing ? 'Stripe has not finished checking your payout account. No new details are currently requested. You can check progress in Payouts.'
        : restricted ? 'Open Payouts to review your account status and the next steps from Stripe.'
          : hasPublishedBooks ? 'Your books are published, but readers cannot purchase them until your Stripe payout setup is complete.'
            : 'Connect Stripe and complete your payout details so readers can purchase your books when you publish.';
  const Icon = result.error || needsHelp ? CircleAlert : reviewing ? Clock3 : Wallet;

  return (
    <section aria-labelledby="payment-setup-heading" className="mt-7 flex flex-col gap-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Icon size={21} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-200" />
        <div role="status">
          <h2 id="payment-setup-heading" className="text-[16px] font-semibold text-[#f5f2eb]">{title}</h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#c5beb2]">{message}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {result.error && <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 text-[13px] text-[#ff9e83] underline">Try again</button>}
        <button type="button" onClick={() => useSellerDrawerStore.getState().open('payout')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#ed6647] px-4 text-[13px] font-semibold text-[#160e0b] hover:bg-[#ff8b6f]">
          {result.error || needsHelp ? 'Open Payouts' : reviewing ? 'Check status' : 'Complete setup'} <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
