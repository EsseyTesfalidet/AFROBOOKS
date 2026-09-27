'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authenticatedPost } from '@/lib/firebase/request';
import { formatStripeAmount as money } from '@/lib/utils/stripeMoney';

interface PayoutStatus {
  connected: boolean;
  ready: boolean;
  enabled: boolean;
  payoutHold?: boolean;
  requirementsDue?: number;
  pendingVerification?: boolean;
  historyAvailable?: boolean;
  countries?: { code: string; name: string }[];
  balance?: { amount: number; currency: string }[];
  pendingBalance?: { amount: number; currency: string }[];
  bankPayouts?: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    arrivalDate: number;
    failureMessage: string | null;
  }[];
}
const buttonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#ed6647] px-4 text-[14px] font-medium text-[#160e0b] hover:bg-[#ff8b6f] disabled:opacity-50';

export default function AuthorPayouts() {
  const uid = useAuthStore((state) => state.userProfile?.uid);
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState('');
  const refreshAttempted = useRef(false);
  const load = useCallback(async () => {
    try {
      const user = useAuthStore.getState().firebaseUser;
      if (!user) throw new Error('Please sign in again.');
      const response = await fetch('/api/stripe/connect', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to check payout setup.');
      setError('');
      setStatus(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to check payout setup.');
    }
  }, []);
  useEffect(() => {
    if (uid) void load();
  }, [uid, load]);
  const connect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await authenticatedPost<{ url: string }>('/api/stripe/connect', {
        action: status?.ready ? 'dashboard' : 'onboarding',
        ...(!status?.connected && country ? { country } : {}),
      });
      const url = new URL(data.url);
      if (
        url.protocol !== 'https:' ||
        !(url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com'))
      )
        throw new Error('Stripe returned an invalid link. Please try again.');
      window.location.assign(url.href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open Stripe.');
      setBusy(false);
    }
  }, [busy, country, status]);
  useEffect(() => {
    if (
      !status?.connected ||
      refreshAttempted.current ||
      new URLSearchParams(window.location.search).get('stripe') !== 'refresh'
    )
      return;
    refreshAttempted.current = true;
    // Expired links return to an authenticated app page for a fresh, single-use
    // Stripe URL. Remove the marker to prevent refresh/back-navigation loops.
    const url = new URL(window.location.href);
    url.searchParams.delete('stripe');
    window.history.replaceState(window.history.state, '', url.href);
    void connect();
  }, [status, connect]);
  return (
    <section className="space-y-4" aria-labelledby="author-payout-title">
      <div>
        <h3 id="author-payout-title" className="text-[16px] font-semibold">
          Receive your earnings
        </h3>
        <p className="mt-2 text-[14px] leading-relaxed text-[#a8a49c]">
          Choose your country, then add your bank details and complete verification securely on
          Stripe. Availability depends on Stripe’s rules for your country.
        </p>
      </div>
      {error && (
        <div role="alert" className="text-sm text-red-300">
          <p>{error}</p>
          <button type="button" onClick={load} className="mt-2 min-h-11 underline">
            Check again
          </button>
        </div>
      )}
      {!status && !error && (
        <p role="status" className="text-sm text-[#a8a49c]">
          Checking Stripe payout setup…
        </p>
      )}
      {status && (
        <>
          <p
            role="status"
            className={`text-sm ${status.ready ? 'text-emerald-300' : 'text-amber-200'}`}
          >
            {status.ready
              ? 'Your Stripe account is ready to receive earnings.'
              : !status.connected
                ? 'Connect Stripe before readers can purchase your books.'
                : status.pendingVerification && !status.requirementsDue
                  ? 'Stripe is reviewing your details. You can check progress on Stripe.'
                  : 'Finish your Stripe setup to receive earnings and enable book purchases.'}
          </p>
          {(!status.enabled || status.payoutHold) && (
            <p className="rounded-lg border border-amber-400/20 p-3 text-sm text-amber-200">
              {status.payoutHold
                ? 'A payment or balance needs review before further earnings can be sent to Stripe.'
                : 'Automatic transfers are currently paused by AfroBooks.'}
            </p>
          )}
          {!status.connected && (
            <div className="space-y-2">
              <label htmlFor="payout-country" className="block text-sm">
                Country of residence or business registration
              </label>
              <select
                id="payout-country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                disabled={busy}
                className="min-h-11 w-full rounded-lg border border-white/15 bg-[#1b1a17] px-3 py-2 text-[16px]"
              >
                <option value="">Choose your country</option>
                {status.countries?.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-relaxed text-[#a8a49c]">
                Use your actual country. This choice cannot be changed after creating the Stripe
                account.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy || (!status.connected && !country)}
            className={buttonClass}
          >
            {busy
              ? 'Opening Stripe…'
              : status.ready
                ? 'Open Stripe'
                : status.connected
                  ? 'Continue Stripe setup'
                  : 'Connect Stripe'}
            <ArrowUpRight size={16} />
          </button>
          <p className="text-xs leading-relaxed text-[#a8a49c]">
            After a confirmed sale, your share is sent to your connected Stripe balance. Funds
            settle before Stripe pays your bank, following the schedule available for your account.
            A transfer to Stripe is separate from a bank payout.
          </p>
          {status.connected && status.historyAvailable && (
            <div className="space-y-5 border-t border-white/10 pt-5">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: 'Available in Stripe', values: status.balance },
                  { label: 'Settling in Stripe', values: status.pendingBalance },
                ].map(({ label, values }) => (
                  <div key={label}>
                    <dt className="text-[#a8a49c]">{label}</dt>
                    <dd className="mt-1 font-semibold">
                      {values?.length
                        ? values.map((value) => money(value.amount, value.currency)).join(' · ')
                        : money(0)}
                    </dd>
                  </div>
                ))}
              </dl>
              <div>
                <h4 className="mb-3 text-sm font-semibold">Recent bank payouts</h4>
                {!status.bankPayouts?.length ? (
                  <p className="text-sm text-[#a8a49c]">
                    No bank payouts yet. They’ll appear here when Stripe sends funds to your bank.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/10">
                    {status.bankPayouts.map((payout) => (
                      <li key={payout.id} className="py-3 text-sm">
                        <div className="flex justify-between gap-3">
                          <span>{money(payout.amount, payout.currency)}</span>
                          <span
                            className={
                              payout.status === 'failed' ? 'text-red-300' : 'text-[#a8a49c]'
                            }
                          >
                            {payout.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#a8a49c]">
                          {payout.status === 'paid' ? 'Arrival date' : 'Expected arrival'}:{' '}
                          {new Date(payout.arrivalDate * 1000).toLocaleDateString()}
                        </p>
                        {payout.failureMessage && (
                          <p className="mt-1 text-xs text-red-300">
                            {payout.failureMessage} Update your payout details in Stripe.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {status.connected && status.historyAvailable === false && (
            <p className="text-sm text-[#a8a49c]">
              Bank payout history is temporarily unavailable here. You can check it on Stripe.
            </p>
          )}
        </>
      )}
    </section>
  );
}
