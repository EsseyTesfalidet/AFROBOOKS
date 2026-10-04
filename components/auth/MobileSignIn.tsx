'use client';

import './mobile-signin.css';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ArrowRight, ArrowLeft, LoaderCircle } from 'lucide-react';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';
import type { ConfirmationResult, RecaptchaVerifier, User } from 'firebase/auth';
import { logIn, logOut, getUserProfile } from '@/lib/firebase/auth';
import { createPhoneVerifier, sendPhoneCode, mobileSocialSignIn, finishMobileIdentity } from '@/lib/firebase/mobileAuth';
import { syncAuthSession, setClientAuthHints } from '@/lib/firebase/session';
import { beginAuthFlow } from '@/lib/auth/flow';
import { queueWelcome } from '@/lib/auth/welcome';
import { mobileAuthSwitchHref } from '@/lib/auth/mobileAccess';
import { isSupportedSmsNumber, mobileProviders, mobileSmsCountries, mobileSignInDestination, normalizePhone, signInError } from '@/lib/auth/mobileSignIn';
import { publicReturnPath } from '@/lib/utils/loginDestination';
import { useAuthStore } from '@/store/authStore';
import { appHaptic } from '@/lib/app/haptics';
import Logo from '@/components/shared/Logo';

const names = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = getCountries().filter(code => mobileSmsCountries.includes(code)).map(code => ({ code, name: names.of(code) ?? code, dial: getCountryCallingCode(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));
const emptyCode = () => Array<string>(6).fill('');
const COOLDOWN_KEY = 'afrobooks:sms-retry-at';

function SocialIcon({ provider }: { provider: 'google' | 'apple' }) {
  return provider === 'google' ? <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg> : <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M17.05 12.54c.03 3.2 2.8 4.27 2.83 4.29-.03.07-.44 1.52-1.46 3.01-.89 1.29-1.81 2.58-3.26 2.61-1.42.03-1.88-.85-3.51-.85-1.62 0-2.13.83-3.48.88-1.4.05-2.46-1.4-3.36-2.68-1.84-2.66-3.25-7.52-1.37-10.81.93-1.64 2.6-2.68 4.41-2.71 1.38-.03 2.68.94 3.52.94.84 0 2.42-1.17 4.08-1  .7.03 2.67.28 3.93 2.13-.1.06-2.35 1.37-2.33 4.19ZM14.37 3.48C15.12 2.57 15.63 1.3 15.49 0c-1.09.04-2.41.73-3.19 1.64-.7.8-1.31 2.08-1.14 3.33 1.22.1 2.46-.62 3.21-1.49Z"/></svg>;
}

export default function MobileSignIn() {
  const router = useRouter();
  const { userProfile, loading, setFirebaseUser, setUserProfile, setLoading } = useAuthStore();
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<CountryCode>('NG');
  const [sentTo, setSentTo] = useState('');
  const [digits, setDigits] = useState(emptyCode);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState('');
  const [success, setSuccess] = useState(false);
  const [remaining, setRemaining] = useState(0);
  // This component only mounts after installed mode has hydrated.
  const [signupHref] = useState(() => {
    const search = typeof window === 'undefined' ? '' : window.location.search;
    const destination = publicReturnPath(new URLSearchParams(search).get('redirect'));
    return mobileAuthSwitchHref('/signup', search, destination ? `/signup?redirect=${encodeURIComponent(destination)}` : '/signup');
  });
  const deadline = useRef(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const challenge = useRef<HTMLDivElement>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const codeInputs = useRef<(HTMLInputElement | null)[]>([]);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    mounted.current = true;
    try { deadline.current = Math.min(Number(sessionStorage.getItem(COOLDOWN_KEY)) || 0, Date.now() + 30000); } catch { /* Storage is optional. */ }
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    const timer = setInterval(tick, 500);
    return () => { mounted.current = false; clearInterval(timer); verifier.current?.clear(); verifier.current = null; confirmation.current = null; };
  }, []);

  useEffect(() => {
    if (!lock.current && !success && !loading && userProfile) {
      router.replace(mobileSignInDestination(userProfile, window.location.search));
    }
  }, [loading, userProfile, router, success]);

  useEffect(() => {
    if (attempt && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const animation = form.current?.animate([{ translate: '0' }, { translate: '-3px' }, { translate: '3px' }, { translate: '0' }], { duration: 240 });
      return () => animation?.cancel();
    }
  }, [attempt]);

  useEffect(() => { if (!busy && sentTo && error) codeInputs.current[0]?.focus(); }, [busy, sentTo, error]);

  function feedback(message: string, fields: Record<string, string> = {}) {
    if (!mounted.current) return;
    setError(message); setFieldErrors(fields); setAttempt(n => n + 1); appHaptic();
  }

  async function complete(user: User, isNewUser: boolean) {
    const profile = await getUserProfile(user.uid);
    if (!profile || profile.status === 'banned') throw new Error('ACCOUNT_NOT_AVAILABLE');
    if (profile.status === 'suspended') throw new Error('ACCOUNT_SUSPENDED');
    await syncAuthSession(await user.getIdToken(), user.uid);
    if (!mounted.current) return;
    queueWelcome(user.uid, isNewUser ? 'signup' : 'signin');
    setClientAuthHints(user.uid, profile.role);
    setSuccess(true); appHaptic('success');
    setFirebaseUser(user); setUserProfile(profile); setLoading(false);
    // Keep the guard held while the success state appears; no auth redirect race.
    await new Promise(resolve => setTimeout(resolve, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650));
    if (mounted.current) router.replace(mobileSignInDestination(profile, window.location.search));
  }

  async function authenticate(kind: string, action: () => Promise<{ user: User; isNewUser: boolean }>) {
    if (lock.current) return;
    lock.current = true; setBusy(kind); setError(''); setFieldErrors({});
    const finish = beginAuthFlow();
    try { const result = await action(); await complete(result.user, result.isNewUser); }
    catch (e) {
      // No half-created identity should be left signed in after a failed profile check.
      await logOut().catch(() => undefined);
      if (mounted.current) {
        setFirebaseUser(null); setUserProfile(null); setLoading(false);
        feedback(signInError(e));
        if (kind === 'code') { setDigits(emptyCode()); codeInputs.current[0]?.focus(); }
      }
    } finally { finish(); lock.current = false; if (mounted.current) setBusy(''); }
  }

  async function requestCode() {
    if (lock.current || Date.now() < deadline.current) return;
    if (!mobileProviders.phone) { feedback(signInError(new Error('provider-disabled'))); return; }
    const number = sentTo || normalizePhone(phone, country);
    if (!number) { feedback('', { phone: 'Enter a valid phone number.' }); return; }
    if (!isSupportedSmsNumber(number)) { feedback(signInError(new Error('sms-region-not-allowed'))); return; }
    lock.current = true; setBusy('send'); setError(''); setFieldErrors({});
    try {
      verifier.current?.clear();
      verifier.current = createPhoneVerifier(challenge.current!);
      const result = await sendPhoneCode(number, verifier.current);
      if (!mounted.current) return;
      confirmation.current = result; setSentTo(number); setDigits(emptyCode());
      deadline.current = Date.now() + 30000; setRemaining(30);
      try { sessionStorage.setItem(COOLDOWN_KEY, String(deadline.current)); } catch { /* Optional. */ }
      appHaptic();
      // Do not force the keyboard open on arrival; OTP autofill remains available.
    } catch (e) { feedback(signInError(e)); }
    finally {
      verifier.current?.clear(); verifier.current = null;
      lock.current = false; if (mounted.current) setBusy('');
    }
  }

  function verify(code: string) {
    const current = confirmation.current;
    if (!current || !/^\d{6}$/.test(code)) return;
    void authenticate('code', async () => {
      const result = await current.confirm(code);
      return { user: result.user, ...await finishMobileIdentity(result.user) };
    });
  }

  function enterDigits(index: number, value: string) {
    if (lock.current) return;
    const numbers = value.replace(/\D/g, '').slice(0, 6);
    const next = [...digits];
    const start = numbers.length === 6 ? 0 : index;
    if (!numbers) next[index] = '';
    else for (let i = 0; i < numbers.length && start + i < 6; i++) next[start + i] = numbers[i];
    setDigits(next); setError('');
    if (numbers) codeInputs.current[Math.min(5, start + numbers.length)]?.focus();
    if (next.every(Boolean)) verify(next.join(''));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (sentTo) { verify(digits.join('')); return; }
    if (mode === 'phone') { void requestCode(); return; }
    const errors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email';
    if (password.length < 6) errors.password = 'Password must be at least 6 characters';
    if (Object.keys(errors).length) { feedback('', errors); form.current?.querySelector<HTMLInputElement>(`#${Object.keys(errors)[0]}`)?.focus(); return; }
    void authenticate('email', async () => ({ user: await logIn(email.trim(), password), isNewUser: false }));
  }

  return <main className="mobile-signin" data-success={success || undefined}>
    <section className="signin-hero" aria-label="AfroBooks">
      <div className="signin-brand"><Logo size="lg" href="/login" /></div>
      <p className="signin-tagline">A home for your stories.</p>
    </section>
    <section className="signin-panel" aria-label="Sign in">
      <div className="signin-panel-inner">
        {success ? <div className="signin-success" role="status" aria-live="polite">
          <span><svg viewBox="0 0 48 48" aria-hidden="true"><path d="m13 24 7 7 15-15"/></svg></span>
          <h1>You’re in.</h1><p>Your next chapter awaits.</p>
        </div> : <>
          <header className="signin-intro signin-enter"><h1>{sentTo ? 'Check your phone' : 'Welcome back'}</h1><p>{sentTo ? `Enter the code sent to ${sentTo}` : 'Your stories are waiting for you.'}</p></header>
          {!sentTo && <div className="signin-methods signin-enter" role="group" aria-label="Sign-in method" data-method={mode}>
            <span aria-hidden="true"/>{(['email', 'phone'] as const).map(method => <button key={method} type="button" disabled={!!busy} aria-pressed={mode === method} onClick={() => { setMode(method); setError(''); setFieldErrors({}); appHaptic(); }}>{method === 'email' ? 'Email' : 'Phone'}</button>)}
          </div>}
          <form ref={form} onSubmit={submit} noValidate className="signin-form signin-enter" aria-busy={!!busy}>
            <div>
              {sentTo ? <div className="signin-code" role="group" aria-label="Six-digit verification code">
                {digits.map((digit, index) => <input key={index} ref={el => { codeInputs.current[index] = el; }} aria-label={`Digit ${index + 1}`} aria-invalid={!!error} aria-describedby={error ? 'signin-error' : undefined}
                  type="text" inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} pattern="[0-9]*" maxLength={6} value={digit} disabled={!!busy}
                  onFocus={e => e.target.select()} onChange={e => enterDigits(index, e.target.value)}
                  onPaste={e => { e.preventDefault(); enterDigits(index, e.clipboardData.getData('text')); }}
                  onKeyDown={e => { if (e.key === 'Backspace' && !digits[index] && index > 0) { e.preventDefault(); const next = [...digits]; next[index - 1] = ''; setDigits(next); codeInputs.current[index - 1]?.focus(); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); codeInputs.current[Math.max(0, Math.min(5, index + (e.key === 'ArrowLeft' ? -1 : 1)))]?.focus(); } }}/>) }
              </div> : mode === 'email' ? <div className="signin-fields">
                <div><div className="signin-field"><input id="email" type="email" placeholder=" " value={email} autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" disabled={!!busy} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'signin-email-error' : undefined} onChange={e => setEmail(e.target.value)}/><label htmlFor="email">Email</label></div>{fieldErrors.email && <p id="signin-email-error" className="signin-error" role="alert">{fieldErrors.email}</p>}</div>
                <div><div className="signin-field"><input id="password" type={showPassword ? 'text' : 'password'} placeholder=" " value={password} autoComplete="current-password" enterKeyHint="go" disabled={!!busy} aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? 'signin-password-error' : undefined} onChange={e => setPassword(e.target.value)}/><label htmlFor="password">Password</label><button className="signin-reveal" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>{fieldErrors.password && <p id="signin-password-error" className="signin-error" role="alert">{fieldErrors.password}</p>}</div>
              </div> : <div className="signin-fields">
                <div className="signin-phone-row"><label className="signin-country"><span className="sr-only">Country code</span><span aria-hidden="true">{country} +{getCountryCallingCode(country)} ▾</span><select aria-label="Country code" value={country} disabled={!!busy} onChange={e => setCountry(e.target.value as CountryCode)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name} (+{c.dial})</option>)}</select></label><div className="signin-field"><input id="phone" type="tel" placeholder=" " autoComplete="tel-national" value={phone} disabled={!!busy} aria-invalid={!!fieldErrors.phone} aria-describedby="signin-phone-help" onChange={e => setPhone(e.target.value)}/><label htmlFor="phone">Phone number</label></div></div>
                {fieldErrors.phone && <p className="signin-error" role="alert">{fieldErrors.phone}</p>}
                <p id="signin-phone-help" className="signin-phone-help">{mobileProviders.phone ? 'By continuing, you agree to receive a verification text and let Google process your number for abuse prevention. Message rates may apply.' : 'Phone sign-in is coming soon. Use email or Google for now.'}</p>
                <p className="signin-phone-help">Already have a library? Use the method you signed up with.</p>
              </div>}
            </div>
            {error && <p id="signin-error" className="signin-error" role="alert">{error}</p>}
            <button className="signin-continue" type="submit" disabled={!!busy || (mode === 'phone' && !sentTo && (!mobileProviders.phone || remaining > 0)) || (!!sentTo && !digits.every(Boolean))}>
              {busy ? <LoaderCircle className="signin-spinner" size={18}/> : null}{busy === 'send' ? 'Sending code…' : busy ? 'Signing in…' : sentTo ? 'Verify code' : mode === 'phone' && remaining > 0 ? `Try again in ${remaining}s` : 'Continue'}{!busy && <ArrowRight size={18}/>}</button>
            {sentTo && <div className="signin-code-actions"><button type="button" disabled={!!busy || remaining > 0} onClick={() => void requestCode()}>{remaining > 0 ? `Resend in ${remaining}s` : 'Resend code'}</button><button type="button" disabled={!!busy} onClick={() => { confirmation.current = null; setSentTo(''); setDigits(emptyCode()); setError(''); }}><ArrowLeft size={14}/>Change number</button></div>}
          </form>
          {!sentTo && <><div className="signin-divider signin-enter"><span/>or continue with<span/></div>
            <div className="signin-social signin-enter">{(['google', 'apple'] as const).map(provider => <button key={provider} type="button" disabled={!!busy} aria-label={`Continue with ${provider === 'google' ? 'Google' : 'Apple'}`} aria-disabled={provider === 'apple' && !mobileProviders.apple || undefined}
              onClick={() => { if (provider === 'apple' && !mobileProviders.apple) { feedback(signInError(new Error('provider-disabled'))); return; } void authenticate(provider, () => mobileSocialSignIn(provider)); }}><span><SocialIcon provider={provider}/></span>{provider === 'google' ? 'Google' : 'Apple'}</button>)}</div>
            <p className="signin-signup signin-enter"><span>New to AfroBooks? </span><Link href={signupHref}>Sign up</Link></p></>}
          <p className="signin-legal signin-enter"><Link href="/terms">Terms</Link><span aria-hidden="true">·</span><Link href="/privacy">Privacy</Link></p>
        </>}
      </div>
    </section>
    <div ref={challenge} className="signin-recaptcha"/>
  </main>;
}
