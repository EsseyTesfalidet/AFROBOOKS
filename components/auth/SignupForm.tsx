'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signUp } from '@/lib/firebase/auth';
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  function setSessionCookie(token: string) {
    document.cookie = `__session=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  }

  async function onSubmit({ email, password, firstName, lastName }: FormData) {
    setError('');
    try {
      const fbUser = await signUp(email, password, firstName, lastName, role);
      const token = await fbUser.getIdToken();
      setSessionCookie(token);
      if (role === 'seller') {
        router.replace('/dashboard');
      } else {
        router.replace('/browse');
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-sm text-[#aaa] mb-1.5">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                {...register('firstName')}
                placeholder="Alex"
                className="w-full px-3.5 py-3 rounded-lg border text-sm"
                style={{
                  background: '#1a1a1a',
                  borderColor: errors.firstName ? '#e8442a' : '#333',
                  color: '#f5f2eb',
                }}
              />
              {errors.firstName && (
                <p className="mt-1 text-xs text-[#e8442a]">{errors.firstName.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm text-[#aaa] mb-1.5">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                {...register('lastName')}
                placeholder="Mensah"
                className="w-full px-3.5 py-3 rounded-lg border text-sm"
                style={{
                  background: '#1a1a1a',
                  borderColor: errors.lastName ? '#e8442a' : '#333',
                  color: '#f5f2eb',
                }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm text-[#aaa] mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              {...register('email')}
              placeholder="you@example.com"
              className="w-full px-3.5 py-3 rounded-lg border text-sm"
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
              placeholder="Min 8 characters"
              hasError={!!errors.password}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-[#e8442a]">{errors.password.message}</p>
            )}
          </div>

          <div>
            <p className="text-sm text-[#aaa] mb-2">I want to join as a...</p>
            <RoleSelector selected={role} onChange={setRole} />
          </div>

          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                {...register('terms')}
                className="mt-0.5 accent-[#e8442a]"
              />
              <span className="text-sm" style={{ color: '#888' }}>
                I agree to the{' '}
                <Link href="/terms" target="_blank" className="hover:underline" style={{ color: '#f5b800' }}>
                  Terms of Service
                </Link>
              </span>
            </label>
            {errors.terms && (
              <p className="mt-1 text-xs text-[#e8442a]">{errors.terms.message}</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-[#e8442a] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2"
            style={{ background: '#fff', color: '#000' }}
          >
            {isSubmitting ? <LoadingSpinner size={16} color="#000" /> : null}
            Create account
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#666]">
          Already have an account?{' '}
          <Link href="/login" className="text-[#f5b800] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
