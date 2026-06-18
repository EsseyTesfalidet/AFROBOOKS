'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen, PenLine, ShieldCheck } from 'lucide-react';
import { signUp } from '@/lib/firebase/auth';
import { setClientAuthHints, syncAuthSession } from '@/lib/firebase/session';
import { useAuthStore } from '@/store/authStore';
import Logo from '@/components/shared/Logo';
import RoleSelector from './RoleSelector';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import PasswordInput from '@/components/shared/PasswordInput';

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  terms: z.literal(true, { errorMap: () => ({ message: 'You must accept the Terms of Service' }) }),
});

type FormData = z.infer<typeof schema>;

export default function SignupForm() {
  const router = useRouter();
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
  const [error, setError] = useState('');
  const { setFirebaseUser, setLoading } = useAuthStore();
  const [signupsOpen, setSignupsOpen] = useState({
    buyer: true,
    seller: true,
    maintenanceMode: false,
  });

  function finishAuthNavigation(destination: string) {
    window.location.replace(destination);
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    fetch('/api/platform/public')
      .then((res) => res.json())
      .then((data) => {
        setSignupsOpen({
          buyer: data.newUserSignupsOpen !== false,
          seller: data.newSellerSignupsOpen !== false,
          maintenanceMode: data.maintenanceMode === true,
        });
      })
      .catch(() => undefined);
  }, []);

  async function onSubmit({ email, password, firstName, lastName }: FormData) {
    setError('');
    if (signupsOpen.maintenanceMode) {
      setError('AfroBooks is currently in maintenance mode. Please try again later.');
      return;
    }
    if (!signupsOpen.buyer) {
      setError('New account creation is currently disabled.');
      return;
    }
    if (role === 'seller' && !signupsOpen.seller) {
      setError('New author signups are currently closed.');
      return;
    }
    try {
      const fbUser = await signUp(email, password, firstName, lastName, role);
      const token = await fbUser.getIdToken();
      await syncAuthSession(token, fbUser.uid);
      setFirebaseUser(fbUser);
      setLoading(false);
      setClientAuthHints(fbUser.uid, role);
      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'welcome', to: email, data: { firstName } }),
      }).catch(() => undefined);
      if (role === 'seller') {
        finishAuthNavigation('/dashboard');
      } else {
        finishAuthNavigation('/browse');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists.');
      } else {
        setError('Failed to create account. Please try again.');
      }
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at top right, rgba(245,184,0,0.14), transparent 24%), radial-gradient(circle at bottom left, rgba(124,58,237,0.12), transparent 18%)',
        }}
      />
      <div
        className="surface-panel relative w-full max-w-[520px] overflow-hidden rounded-[28px] p-8 sm:p-10"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32"
          style={{ background: 'linear-gradient(180deg, rgba(232,68,42,0.08) 0%, transparent 100%)' }}
        />
        <div className="relative">
          <span className="eyebrow-chip">Create Account</span>
          <div className="mt-5 text-center">
            <Logo size="lg" href="/" />
            <h1 className="mt-6 font-display text-5xl leading-none text-white">Join AfroBooks</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#9a9aa3]">
              Create one polished account for discovering books, building your audience, and publishing when you are ready.
            </p>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {[
              { label: 'Reader-ready library', icon: BookOpen },
              { label: 'Author tools included', icon: PenLine },
              { label: 'Protected account', icon: ShieldCheck },
            ].map(({ label, icon: Icon }) => (
              <div key={label} className="surface-panel-muted rounded-2xl px-3 py-3 text-center">
                <Icon size={15} className="mx-auto text-[#f5b800]" />
                <p className="mt-2 text-[11px] font-medium text-[#d4d4d8]">{label}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="field-label mb-1.5 block text-sm">
                  First name
                </label>
                <input
                  id="firstName"
                  type="text"
                  {...register('firstName')}
                  placeholder="Alex"
                  className="field-input w-full rounded-xl px-3.5 py-3 text-sm"
                  style={{
                    borderColor: errors.firstName ? '#e8442a' : '#333',
                  }}
                />
                {errors.firstName && (
                  <p className="mt-1 text-xs text-[#e8442a]">{errors.firstName.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="lastName" className="field-label mb-1.5 block text-sm">
                  Last name
                </label>
                <input
                  id="lastName"
                  type="text"
                  {...register('lastName')}
                  placeholder="Mensah"
                  className="field-input w-full rounded-xl px-3.5 py-3 text-sm"
                  style={{
                    borderColor: errors.lastName ? '#e8442a' : '#333',
                  }}
                />
              </div>
            </div>

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
                placeholder="Min 8 characters"
                hasError={!!errors.password}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-[#e8442a]">{errors.password.message}</p>
              )}
            </div>

            <div>
              <p className="field-label mb-2 text-sm">I want to join as a...</p>
              <RoleSelector selected={role} onChange={setRole} />
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  {...register('terms')}
                  className="mt-0.5 accent-[#e8442a]"
                />
                <span className="text-sm text-[#8d8d96]">
                  I agree to the{' '}
                  <Link href="/terms" target="_blank" className="font-medium text-[#f5b800] transition-colors hover:text-[#ffd24d]">
                    Terms of Service
                  </Link>
                </span>
              </label>
              {errors.terms && (
                <p className="mt-1 text-xs text-[#e8442a]">{errors.terms.message}</p>
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
              Create account
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#7b7b84]">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-[#f5b800] transition-colors hover:text-[#ffd24d]">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
