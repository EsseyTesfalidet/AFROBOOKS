'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/shared/Logo';
import { useAuthStore } from '@/store/authStore';
import { authenticatedPost } from '@/lib/firebase/request';
import { logOutAndRedirect } from '@/lib/firebase/auth';
import { hasCurrentAgreement, LEGAL_CONTACT, LEGAL_VERSION } from '@/lib/legal';
import type { User } from '@/types/user';

function AgreementForm({ uid }: { uid: string }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function agree() {
    if (!checked || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await authenticatedPost<{ agreement: NonNullable<User['legalAgreement']> }>(
        '/api/account/agreement',
        { termsAccepted: true, privacyAcknowledged: true, version: LEGAL_VERSION },
      );
      const store = useAuthStore.getState();
      if (store.userProfile?.uid === uid)
        store.setUserProfile({ ...store.userProfile, legalAgreement: result.agreement });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Your agreement could not be saved. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await logOutAndRedirect('/');
    } catch {
      setError('Unable to sign out. Please try again.');
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#10100f] px-5 py-10 text-[#f5f2eb]">
      <div className="w-full max-w-xl">
        <Logo size="sm" href="/" />
        <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c5a56a]">
          Before you continue
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
        Review our updated terms
        </h1>
        <p className="mt-5 text-[15px] leading-7 text-[#b9b5ac]">
          Please review our updated terms and privacy information. They explain reading access,
          payments, author earnings, and how your information is handled.
        </p>
        <nav
          aria-label="Documents to review"
          className="my-7 divide-y divide-white/10 border-y border-white/10"
        >
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-16 items-center justify-between gap-4 py-3 text-sm text-[#e5c68e] underline underline-offset-4"
          >
            Terms of use <span className="text-xs text-[#a8a49c]">Opens in a new tab</span>
          </Link>
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-16 items-center justify-between gap-4 py-3 text-sm text-[#e5c68e] underline underline-offset-4"
          >
            Privacy information <span className="text-xs text-[#a8a49c]">Opens in a new tab</span>
          </Link>
        </nav>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            disabled={busy}
            className="mt-1 h-5 w-5 shrink-0 accent-[#ed6647]"
          />
          <span>
            I agree to the Terms of use and acknowledge that I have read the Privacy information,
            updated September 27, 2026.
          </span>
        </label>
        <p className="mt-3 pl-8 text-xs leading-6 text-[#a8a49c]">
          We save the document versions and date. This does not sign you up for marketing.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm leading-6 text-red-300">
            {error}
          </p>
        )}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={agree}
            disabled={!checked || busy}
            className="min-h-12 rounded-lg bg-[#ed6647] px-5 text-sm font-semibold text-[#160e0b] hover:bg-[#ff8b6f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Please wait…' : 'Agree and continue'}
          </button>
          <button
            type="button"
            onClick={leave}
            disabled={busy}
            className="min-h-12 px-4 text-sm text-[#b9b5ac] underline underline-offset-4 disabled:opacity-50"
          >
            Sign out instead
          </button>
        </div>
        <p className="mt-8 text-xs leading-6 text-[#a8a49c]">
          Prefer not to agree? You can still read both documents and{' '}
          <a
            className="text-[#e5c68e] underline underline-offset-4"
            href={`mailto:${LEGAL_CONTACT}?subject=Account%20and%20privacy%20help`}
          >
            contact support
          </a>{' '}
          about your information, billing, account deletion, or existing purchases.
        </p>
      </div>
    </main>
  );
}

export default function AgreementGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const profile = useAuthStore((state) => state.userProfile);
  // Documents remain public and readable without accepting them. Signup records
  // its own explicit checkbox; Google and existing accounts use this same gate.
  if (
    ['/terms', '/privacy', '/login', '/signup'].includes(path) ||
    !profile ||
    hasCurrentAgreement(profile)
  )
    return children;
  return <AgreementForm key={profile.uid} uid={profile.uid} />;
}
