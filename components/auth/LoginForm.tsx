'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen, ShieldCheck, Sparkles } from 'lucide-react';
import { logIn, signInWithGoogle, getUserProfile } from '@/lib/firebase/auth';
import { setClientAuthHints, syncAuthSession } from '@/lib/firebase/session';
import { useAuthStore } from '@/store/authStore';
import Logo from '@/components/shared/Logo';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import PasswordInput from '@/components/shared/PasswordInput';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const { userProfile, loading, setFirebaseUser, setUserProfile, setLoading } = useAuthStore();

  function finishAuthNavigation(destination: string) {
    window.location.replace(destination);
  }

  useEffect(() => {
    if (!loading && userProfile) {
      if (userProfile.role === 'admin') router.replace('/admin');
      else if (userProfile.activeRole === 'seller') router.replace('/dashboard');
      else router.replace('/browse');
    }
  }, [loading, userProfile]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit({ email, password }: FormData) {
    setError('');
    try {
      const fbUser = await logIn(email, password);
      const token = await fbUser.getIdToken();
      await syncAuthSession(token, fbUser.uid);
      const profile = await getUserProfile(fbUser.uid);
      setFirebaseUser(fbUser);
      setUserProfile(profile);
      setLoading(false);
      setClientAuthHints(fbUser.uid, profile?.role ?? 'buyer');
      if (profile?.role === 'admin') {
        finishAuthNavigation('/admin');
      } else if (profile?.activeRole === 'seller') {
        finishAuthNavigation('/dashboard');
      } else {
        finishAuthNavigation('/browse');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found')) {
        setError('Incorrect email or password.');
      } else if (msg.includes('too-many-requests')) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (msg.includes('network-request-failed')) {
        setError('Network error. Check your connection and try again.');
      } else {
        setError('Something went wrong. Try again.');
      }
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError('');
    try {
      const user = await signInWithGoogle();
      if (!user) return;
      const token = await user.getIdToken();
      await syncAuthSession(token, user.uid);
      const profile = await getUserProfile(user.uid);
      setFirebaseUser(user);
      setUserProfile(profile);
      setLoading(false);
      setClientAuthHints(user.uid, profile?.role ?? 'buyer');
      if (profile?.role === 'admin') finishAuthNavigation('/admin');
      else if (profile?.activeRole === 'seller') finishAuthNavigation('/dashboard');
      else finishAuthNavigation('/browse');
    } catch (e: unknown) {
      setGoogleLoading(false);
      const code =
        typeof e === 'object' && e && 'code' in e
          ? String((e as { code?: string }).code)
          : '';

      if (code === 'auth/unauthorized-domain') {
        setError('Google sign-in is blocked for this domain. Add this site to Firebase Auth authorized domains.');
      } else if (code === 'auth/operation-not-allowed') {
        setError('Google sign-in is not enabled in Firebase Authentication.');
      } else if (code === 'auth/popup-blocked') {
        setError('The sign-in popup was blocked by the browser.');
      } else {
        setError('Google sign-in failed. Check Firebase Auth provider and authorized domains.');
      }
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at top left, rgba(232,68,42,0.16), transparent 24%), radial-gradient(circle at bottom right, rgba(14,165,233,0.12), transparent 20%)',
        }}
      />
      <div
        className="surface-panel relative w-full max-w-[460px] overflow-hidden rounded-[28px] p-8 sm:p-10"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32"
          style={{ background: 'linear-gradient(180deg, rgba(245,184,0,0.08) 0%, transparent 100%)' }}
        />
        <div className="relative">
          <span className="eyebrow-chip">Secure Sign In</span>
          <div className="mt-5 text-center">
            <Logo size="lg" href="/" />
            <h1 className="mt-6 font-display text-5xl leading-none text-white">Welcome back</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#9a9aa3]">
              Get back to your library, purchases, and reading progress without missing a beat.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            {[
              { label: 'Saved library', icon: BookOpen },
              { label: 'Fast checkout', icon: Sparkles },
              { label: 'Protected access', icon: ShieldCheck },
            ].map(({ label, icon: Icon }) => (
              <div key={label} className="surface-panel-muted rounded-2xl px-3 py-3 text-center">
                <Icon size={15} className="mx-auto text-[#f5b800]" />
                <p className="mt-2 text-[11px] font-medium text-[#d4d4d8]">{label}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="field-label mb-1.5 block text-sm">
                Email
              </label>
              <input
                id="email"
                type="email"
                {...register('email')}
                placeholder="you@example.com"
                className="field-input w-full rounded-xl px-3.5 py-3 text-sm"
                style={{
                  borderColor: errors.email ? '#e8442a' : '#333',
                }}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-[#e8442a]">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="field-label mb-1.5 block text-sm">
                Password
              </label>
              <PasswordInput
                id="password"
                {...register('password')}
                placeholder="••••••••"
                hasError={!!errors.password}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-[#e8442a]">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <p className="text-center text-sm text-[#e8442a]">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="button-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <LoadingSpinner size={16} color="#000" /> : null}
              Sign in
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs uppercase tracking-[0.2em] text-[#5d5d66]">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="button-secondary flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
          >
            {googleLoading ? (
              <LoadingSpinner size={16} color="#f5f2eb" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </button>

          <p className="mt-6 text-center text-sm text-[#7b7b84]">
            Don't have an account?{' '}
            <Link href="/signup" className="font-medium text-[#f5b800] transition-colors hover:text-[#ffd24d]">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
