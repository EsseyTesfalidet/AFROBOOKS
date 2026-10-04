'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, PenLine, Wallet } from 'lucide-react';
import Logo from '@/components/shared/Logo';
import { useAuthStore } from '@/store/authStore';
import { getUserProfile, updateUserProfile } from '@/lib/firebase/auth';
import { beginAuthFlow } from '@/lib/auth/flow';
import { appFetch } from '@/lib/network';

const returnTo = encodeURIComponent('/author/start?view=web');

export default function AuthorWebStart() {
  const router = useRouter();
  const { firebaseUser, userProfile, loading } = useAuthStore();
  const [open, setOpen] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settingsError, setSettingsError] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const signedIn = !!firebaseUser && userProfile?.uid === firebaseUser.uid;
  const author = signedIn && ['seller', 'both', 'admin'].includes(userProfile.role);

  useEffect(() => {
    let active = true;
    appFetch('/api/platform/public').then(async response => {
      if (!response.ok) throw new Error('settings');
      const settings = await response.json();
      if (active) { setOpen(settings.newSellerSignupsOpen !== false && settings.maintenanceMode !== true); setSettingsError(false); }
    }).catch(() => { if (active) setSettingsError(true); });
    return () => { active = false; };
  }, [attempt]);

  async function start() {
    if (locked.current || !signedIn || (!author && !open)) return;
    locked.current = true; setBusy(true); setError('');
    const finish = beginAuthFlow();
    try {
      // Upgrade this identity through the existing protected endpoint. Never
      // create a second reader account or change purchases/earnings here.
      await updateUserProfile(firebaseUser.uid, { ...(!author ? { role: 'both' as const } : {}), activeRole: 'seller' });
      const profile = await getUserProfile(firebaseUser.uid);
      if (!profile || !['seller', 'both', 'admin'].includes(profile.role)) throw new Error('profile');
      if (useAuthStore.getState().firebaseUser?.uid !== firebaseUser.uid) return;
      useAuthStore.getState().setUserProfile(profile);
      router.push('/dashboard');
    } catch { setError('Author setup could not finish. Please try again. Your reader account is still available.'); }
    finally { finish(); locked.current = false; setBusy(false); }
  }

  return <main className="min-h-screen bg-[#0e0e0e] px-5 py-10 text-[#f5f2eb]">
    <div className="mx-auto max-w-xl space-y-8">
      <Logo href="/browse" size="md" />
      <header className="space-y-3"><p className="text-sm text-[#f5b800]">AfroBooks Author Studio</p><h1 className="font-display text-4xl">{author ? 'Your publishing home' : 'Share your stories'}</h1><p className="leading-relaxed text-[#b5b5bd]">Set up your author profile, publish your work and manage your earnings on the website. Keep reading in the app with the same account.</p></header>
      <ul className="space-y-4 rounded-2xl border border-white/10 bg-white/[.03] p-5 text-sm">
        <li className="flex gap-3"><PenLine size={19} className="shrink-0 text-[#f5b800]" />Publish books, short stories and magazine issues.</li>
        <li className="flex gap-3"><Wallet size={19} className="shrink-0 text-[#f5b800]" />Complete author verification and connect your payout account.</li>
        <li className="flex gap-3"><BookOpen size={19} className="shrink-0 text-[#f5b800]" />Your existing library and reading progress stay with you.</li>
      </ul>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {loading ? <p role="status">Checking your account…</p> : signedIn ? <section className="space-y-3">
        <p className="text-sm text-[#b5b5bd]">Continue as {userProfile.firstName || userProfile.username || 'your current account'}.</p>
        {author || open ? <button type="button" onClick={start} disabled={busy} className="button-primary min-h-12 rounded-xl px-6 py-3 disabled:opacity-60">{busy ? 'Opening Author Studio…' : author ? 'Open Author Studio' : 'Enable author tools'}</button> : settingsError ? <p role="alert">Unable to check author availability. <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 underline">Retry</button></p> : open === null ? <p role="status">Checking author availability…</p> : <p role="status">New author setup is currently closed. You can keep using your reader account.</p>}
      </section> : <section className="space-y-4">
        <p className="text-sm leading-relaxed text-[#b5b5bd]">Already use the app? Sign in with the same method to keep your library. Your browser may ask you to sign in again.</p>
        <Link href={`/login?redirect=${returnTo}`} className="button-primary inline-flex min-h-12 items-center rounded-xl px-6 py-3">Sign in to your account</Link>
        {open && <p className="text-sm">New to AfroBooks? <Link href={`/signup?role=seller&redirect=${returnTo}`} className="inline-flex min-h-11 items-center text-[#f5b800] underline">Create an author account</Link></p>}
      </section>}
      <Link href="/browse" className="inline-flex min-h-11 items-center text-sm text-[#b5b5bd] underline">Continue reading</Link>
    </div>
  </main>;
}
