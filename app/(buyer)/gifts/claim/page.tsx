'use client';

import { accountFetch } from '@/lib/network';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { sendEmailVerification } from 'firebase/auth';
import { Gift, CheckCircle } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
import { logOutAndRedirect } from '@/lib/firebase/auth';
import { giftTokenSchema, type GiftPreview } from '@/lib/gifts';

const TOKEN_KEY = 'afrobooks-gift-token';
const LOGIN = '/login?redirect=%2Fgifts%2Fclaim';

export default function ClaimGiftPage() {
  const { firebaseUser, loading: authLoading } = useAuthStore();
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<GiftPreview | null>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get('token');
    try {
      const value = fragment ?? sessionStorage.getItem(TOKEN_KEY);
      if (giftTokenSchema.safeParse(value).success) {
        sessionStorage.setItem(TOKEN_KEY, value!); setToken(value!);
        window.history.replaceState(null, '', '/gifts/claim');
      } else setError('This link is missing its gift code. Open the full link from your gift email.');
    } catch { setError('Allow browser session storage, then reopen your gift link to continue.'); }
    setReady(true);
  }, []);

  const request = useCallback(async (action: 'preview' | 'claim') => {
    if (!firebaseUser || !token) return;
    setBusy(true); setError(''); setCode(''); setNotice('');
    try {
      await firebaseUser.reload();
      const response = await accountFetch('/api/gifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await firebaseUser.getIdToken(true)}` },
        body: JSON.stringify({ action, token }),
      });
      const data = await response.json();
      if (!response.ok) { setPreview(null); setError(data.error || 'Unable to open this gift.'); setCode(data.code || ''); return; }
      setPreview(data);
    } catch { setError('Unable to open this gift. Please check your connection and try again.'); }
    finally { setBusy(false); }
  }, [firebaseUser, token]);

  useEffect(() => { if (ready && !authLoading && firebaseUser && token) void request('preview'); }, [ready, authLoading, firebaseUser, token, request]);

  async function verifyEmail() {
    if (!firebaseUser) return;
    setBusy(true); setError('');
    try {
      await sendEmailVerification(firebaseUser, { url: `${window.location.origin}/gifts/claim` });
      setVerificationSent(true); setNotice('Verification email sent. Open it, then return here and check again.');
    } catch { setError('Unable to send verification. Please wait a moment and try again.'); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-[#0e0e0e]">
    <BuyerHeader />
    <main className="max-w-lg mx-auto px-4 py-10">
      <div className="rounded-2xl border border-[#292929] bg-[#111] p-6 space-y-5">
        {preview?.claimed ? <CheckCircle size={36} className="text-green-400" /> : <Gift size={36} className="text-[#f5b800]" />}
        <h1 className="font-display text-3xl text-white">{preview?.claimed ? 'Your book is ready' : 'A book for you'}</h1>
        {!ready || authLoading ? <LoadingSpinner /> : !firebaseUser && token ? <>
          <p className="text-sm text-[#aaa]">Sign in or create an account with the email address your gift was sent to.</p>
          <div className="flex flex-wrap gap-4"><Link href={LOGIN} className="button-primary rounded-xl px-5 py-3 text-sm">Sign in</Link><Link href="/signup?redirect=%2Fgifts%2Fclaim" className="py-3 text-sm text-[#f5b800] underline">Create account</Link></div>
        </> : preview ? <>
          <div><p className="text-sm text-[#aaa]">From {preview.senderName}</p><h2 className="text-2xl text-white mt-2">{preview.bookTitle}</h2></div>
          {preview.message && <blockquote className="whitespace-pre-wrap break-words border-l-2 border-[#f5b800] pl-4 text-sm text-[#ccc]">{preview.message}</blockquote>}
          {preview.claimed ? <><p className="text-sm text-[#aaa]">This gift has been added to your library.</p><Link href={`/read/${preview.bookId}`} className="button-primary inline-block rounded-xl px-5 py-3 text-sm">Start reading</Link><Link href="/library" className="ml-4 text-sm text-[#f5b800] underline">My library</Link></> : <><p className="text-sm text-[#aaa]">Claim it to add this book to your library. You will not be charged.</p><button disabled={busy} onClick={() => request('claim')} className="button-primary w-full rounded-xl px-5 py-3 text-sm disabled:opacity-60">{busy ? 'Claiming…' : 'Claim my book'}</button></>}
        </> : busy ? <LoadingSpinner /> : null}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-[#aaa]">{notice}</p>}
        {firebaseUser && token && !preview?.claimed && <div className="flex flex-wrap gap-4 text-sm">
          {code === 'VERIFY_EMAIL' && <button disabled={busy || verificationSent} onClick={verifyEmail} className="text-[#f5b800] underline disabled:opacity-60">{verificationSent ? 'Verification email sent' : 'Send verification email'}</button>}
          {!preview && <button disabled={busy} onClick={() => request('preview')} className="text-[#f5b800] underline disabled:opacity-60">{code === 'VERIFY_EMAIL' ? 'I have verified my email' : 'Check gift again'}</button>}
          <button disabled={busy} onClick={() => logOutAndRedirect(LOGIN)} className="text-[#aaa] underline">Use a different account</button>
        </div>}
      </div>
    </main>
  </div>;
}
