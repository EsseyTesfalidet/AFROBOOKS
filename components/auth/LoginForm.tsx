'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  const { userProfile, loading } = useAuthStore();

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
      setClientAuthHints(fbUser.uid, profile?.role ?? 'buyer');
      if (profile?.role === 'admin') {
        router.replace('/admin');
      } else if (profile?.activeRole === 'seller') {
        router.replace('/dashboard');
      } else {
        router.replace('/browse');
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
      setClientAuthHints(user.uid, profile?.role ?? 'buyer');
      if (profile?.role === 'admin') router.replace('/admin');
      else if (profile?.activeRole === 'seller') router.replace('/dashboard');
      else router.replace('/browse');
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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0e0e0e' }}>
      <div
        className="w-full max-w-[420px] p-8 rounded-2xl border"
        style={{ background: '#111', borderColor: '#222' }}
      >
        <div className="text-center mb-6">
          <Logo size="lg" href="/" />
          <p className="mt-2 text-sm" style={{ color: '#888' }}>
            Africa's boldest ebook marketplace
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-[#aaa] mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              {...register('email')}
              placeholder="you@example.com"
              className="w-full px-3.5 py-3 rounded-lg border text-sm transition-colors"
              style={{
                background: '#1a1a1a',
                borderColor: errors.email ? '#e8442a' : '#333',
                color: '#f5f2eb',
              }}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-[#e8442a]">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-[#aaa] mb-1.5">
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
            <p className="text-sm text-[#e8442a] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-opacity"
            style={{ background: '#fff', color: '#000' }}
          >
            {isSubmitting ? <LoadingSpinner size={16} color="#000" /> : null}
            Sign in
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: '#222' }} />
          <span className="text-xs text-[#444]">or</span>
          <div className="flex-1 h-px" style={{ background: '#222' }} />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 border"
          style={{ background: '#fff', color: '#000', borderColor: '#ddd' }}
        >
          {googleLoading ? (
            <LoadingSpinner size={16} color="#000" />
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

        <p className="mt-6 text-center text-sm text-[#666]">
          Don't have an account?{' '}
          <Link href="/signup" className="text-[#f5b800] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
