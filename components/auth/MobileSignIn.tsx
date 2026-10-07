'use client';

import './mobile-signin.css';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ArrowRight, ArrowLeft, LoaderCircle } from 'lucide-react';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';
import type { ConfirmationResult, RecaptchaVerifier, User } from 'firebase/auth';
import { logIn, logOut, getUserProfile } from '@/lib/firebase/auth';
import { mobileSocialSignIn } from '@/lib/firebase/mobileAuth';
import { createRecoveryPhoneVerifier, sendAccountRecoveryCode, resolveAccountRecovery, sendAccountPasswordReset } from '@/lib/firebase/recoveryPhone';
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
const COOLDOWN_KEY = 'afrobooks:recovery-sms-retry-at';

function SocialIcon({ provider }: { provider: 'google' | 'apple' }) {
  return provider === 'google' ? <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg> : <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M17.05 12.54c.03 3.2 2.8 4.27 2.83 4.29-.03.07-.44 1.52-1.46 3.01-.89 1.29-1.81 2.58-3.26 2.61-1.42.03-1.88-.85-3.51-.85-1.62 0-2.13.83-3.48.88-1.4.05-2.46-1.4-3.36-2.68-1.84-2.66-3.25-7.52-1.37-10.81.93-1.64 2.6-2.68 4.41-2.71 1.38-.03 2.68.94 3.52.94.84 0 2.42-1.17 4.08-1  .7.03 2.67.28 3.93 2.13-.1.06-2.35 1.37-2.33 4.19ZM14.37 3.48C15.12 2.57 15.63 1.3 15.49 0c-1.09.04-2.41.73-3.19 1.64-.7.8-1.31 2.08-1.14 3.33 1.22.1 2.46-.62 3.21-1.49Z"/></svg>;
}

export default function MobileSignIn() {
  const router = useRouter();
  const { userProfile, loading, setFirebaseUser, setUserProfile, setLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<CountryCode>('NG');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoverySentTo, setRecoverySentTo] = useState('');
  const [recoveryAccount, setRecoveryAccount] = useState<{ email: string; providers: string[] } | null>(null);
  const [resetSent, setResetSent] = useState(false);
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

  useEffect(() => { if (!busy && recoverySentTo && error) codeInputs.current[0]?.focus(); }, [busy, recoverySentTo, error]);

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

  async function requestRecoveryCode() {
    if (lock.current || Date.now() < deadline.current) return;
    if (!mobileProviders.phoneRecovery) { feedback(signInError(new Error('provider-disabled'))); return; }
    const number = normalizePhone(phone, country);
    if (!number) { feedback('', { phone: 'Enter a valid phone number.' }); return; }
    if (!isSupportedSmsNumber(number)) { feedback(signInError(new Error('sms-region-not-allowed'))); return; }
    lock.current = true; setBusy('send'); setError(''); setFieldErrors({});
    try {
      verifier.current?.clear();
      verifier.current = createRecoveryPhoneVerifier(challenge.current!);
      const result = await sendAccountRecoveryCode(number, verifier.current);
      if (!mounted.current) return;
      confirmation.current = result; setRecoverySentTo(number); setDigits(emptyCode());
      deadline.current = Date.now() + 30000; setRemaining(30);
      try { sessionStorage.setItem(COOLDOWN_KEY, String(deadline.current)); } catch { /* Optional. */ }
      appHaptic();
    } catch (e) { feedback(signInError(e)); }
    finally {
      verifier.current?.clear(); verifier.current = null;
      lock.current = false; if (mounted.current) setBusy('');
    }
  }

  function verifyRecovery(code: string) {
    const current = confirmation.current;
    if (!current || !/^\d{6}$/.test(code)) return;
    if (lock.current) return;
    lock.current = true; setBusy('verify'); setError('');
    void resolveAccountRecovery(current, code).then(result => {
      if (!mounted.current) return;
      confirmation.current = null; setRecoveryAccount(result); setRecoverySentTo(''); setDigits(emptyCode()); appHaptic('success');
    }).catch(error => {
      if (mounted.current) { setDigits(emptyCode()); feedback(/RECOVERY_ACCOUNT_NOT_FOUND/.test(String(error)) ? 'We couldn’t recover an email sign-in for this number. You have not been signed in. Check the number or contact support.' : signInError(error)); }
    }).finally(() => { lock.current = false; if (mounted.current) setBusy(''); });
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
    if (next.every(Boolean) && recoveryOpen && recoverySentTo) verifyRecovery(next.join(''));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (recoveryOpen) {
      if (recoverySentTo) verifyRecovery(digits.join(''));
      else void requestRecoveryCode();
      return;
    }
    const errors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email';
    if (password.length < 6) errors.password = 'Password must be at least 6 characters';
    if (Object.keys(errors).length) { feedback('', errors); form.current?.querySelector<HTMLInputElement>(`#${Object.keys(errors)[0]}`)?.focus(); return; }
    void authenticate('email', async () => ({ user: await logIn(email.trim(), password), isNewUser: false }));
  }

  function startRecovery() {
    confirmation.current = null; setRecoveryOpen(true); setRecoverySentTo(''); setRecoveryAccount(null); setResetSent(false);
    setDigits(emptyCode()); setPhone(''); setError(''); setFieldErrors({});
  }

  function backToSignIn() {
    confirmation.current = null; setRecoveryOpen(false); setRecoverySentTo(''); setRecoveryAccount(null); setResetSent(false);
    setDigits(emptyCode()); setError(''); setFieldErrors({});
  }

  async function sendResetEmail() {
    if (!recoveryAccount || !recoveryAccount.providers.includes('password') || busy) return;
    setBusy('reset'); setError('');
    try {
      await sendAccountPasswordReset(recoveryAccount.email);
      if (mounted.current) { setResetSent(true); appHaptic('success'); }
    } catch (failure) { if (mounted.current) feedback(signInError(failure)); }
    finally { if (mounted.current) setBusy(''); }
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
          <header className="signin-intro signin-enter"><h1>{recoveryAccount ? 'Account recovered' : recoverySentTo ? 'Verify your number' : recoveryOpen ? 'Recover your account' : 'Welcome back'}</h1><p>{recoveryAccount ? 'Your phone helped locate the existing AfroBooks account.' : recoverySentTo ? <>Enter the code sent to {recoverySentTo}</> : recoveryOpen ? 'Use the recovery number already linked to your account.' : 'Your stories are waiting for you.'}</p></header>
          {recoveryAccount ? <div className="signin-recovery-result signin-enter">
            <span className="signin-recovery-label">Email on your account</span><strong>{recoveryAccount.email}</strong>
            {recoveryAccount.providers.includes('password') ? resetSent
              ? <p role="status">Password reset instructions were sent to this email. Check your inbox.</p>
              : <button className="signin-continue" type="button" disabled={!!busy} onClick={() => void sendResetEmail()}>{busy === 'reset' ? <LoaderCircle className="signin-spinner" size={18}/> : null}{busy === 'reset' ? 'Sending reset link…' : 'Send password reset link'}{!busy && <ArrowRight size={18}/>}</button>
              : <p>This account uses {recoveryAccount.providers.includes('google.com') ? 'Google' : 'Apple'} sign-in. Choose that provider on the sign-in screen; phone verification did not sign you in.</p>}
            {error && <p id="signin-error" className="signin-error" role="alert">{error}</p>}
          </div> : <form ref={form} onSubmit={submit} noValidate className="signin-form signin-enter" aria-busy={!!busy}>
            {recoveryOpen ? recoverySentTo ? <div className="signin-code" role="group" aria-label="Six-digit verification code">
              {digits.map((digit, index) => <input key={index} ref={el => { codeInputs.current[index] = el; }} aria-label={'Digit ' + (index + 1)} aria-invalid={!!error} aria-describedby={error ? 'signin-error' : undefined}
                type="text" inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} pattern="[0-9]*" maxLength={6} value={digit} disabled={!!busy}
                onFocus={e => e.target.select()} onChange={e => enterDigits(index, e.target.value)}
                onPaste={e => { e.preventDefault(); enterDigits(index, e.clipboardData.getData('text')); }}
                onKeyDown={e => { if (e.key === 'Backspace' && !digits[index] && index > 0) { e.preventDefault(); const next = [...digits]; next[index - 1] = ''; setDigits(next); codeInputs.current[index - 1]?.focus(); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); codeInputs.current[Math.max(0, Math.min(5, index + (e.key === 'ArrowLeft' ? -1 : 1)))]?.focus(); } }}/>) }
            </div> : <div className="signin-fields">
              <div className="signin-phone-row"><label className="signin-country"><span className="sr-only">Country code</span><span aria-hidden="true">{country} +{getCountryCallingCode(country)} ▾</span><select aria-label="Country code" value={country} disabled={!!busy} onChange={e => setCountry(e.target.value as CountryCode)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name} (+{c.dial})</option>)}</select></label><div className="signin-field"><input id="phone" type="tel" placeholder=" " autoComplete="tel-national" value={phone} disabled={!!busy} aria-invalid={!!fieldErrors.phone} onChange={e => setPhone(e.target.value)}/><label htmlFor="phone">Recovery phone number</label></div></div>
              {fieldErrors.phone && <p className="signin-error" role="alert">{fieldErrors.phone}</p>}
              <p className="signin-phone-help">We’ll text a code to check for an existing account. This will not sign you in. Message rates may apply.</p>
            </div> : <div className="signin-fields">
              <div><div className="signin-field"><input id="email" type="email" placeholder=" " value={email} autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" disabled={!!busy} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'signin-email-error' : undefined} onChange={e => setEmail(e.target.value)}/><label htmlFor="email">Email</label></div>{fieldErrors.email && <p id="signin-email-error" className="signin-error" role="alert">{fieldErrors.email}</p>}</div>
              <div><div className="signin-field"><input id="password" type={showPassword ? 'text' : 'password'} placeholder=" " value={password} autoComplete="current-password" enterKeyHint="go" disabled={!!busy} aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? 'signin-password-error' : undefined} onChange={e => setPassword(e.target.value)}/><label htmlFor="password">Password</label><button className="signin-reveal" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>{fieldErrors.password && <p id="signin-password-error" className="signin-error" role="alert">{fieldErrors.password}</p>}</div>
            </div>}
            {error && !recoveryAccount && <p id="signin-error" className="signin-error" role="alert">{error}</p>}
            <button className="signin-continue" type="submit" disabled={!!busy || (recoveryOpen && (recoverySentTo ? !digits.every(Boolean) : !mobileProviders.phoneRecovery || remaining > 0))}>
              {busy ? <LoaderCircle className="signin-spinner" size={18}/> : null}{busy === 'send' ? 'Sending code…' : busy === 'verify' ? 'Checking account…' : busy ? 'Signing in…' : recoverySentTo ? 'Verify code' : recoveryOpen && remaining > 0 ? 'Try again in ' + remaining + 's' : 'Continue'}{!busy && <ArrowRight size={18}/>}</button>
            {recoverySentTo && <div className="signin-code-actions"><button type="button" disabled={!!busy || remaining > 0} onClick={() => void requestRecoveryCode()}>{remaining > 0 ? 'Resend in ' + remaining + 's' : 'Resend code'}</button><button type="button" disabled={!!busy} onClick={() => { confirmation.current = null; setRecoverySentTo(''); setDigits(emptyCode()); setError(''); }}><ArrowLeft size={14}/>Change number</button></div>}
          </form>}
          {!recoveryOpen && !recoveryAccount && <><button className="signin-recovery-link signin-enter" type="button" onClick={startRecovery}>Forgot email or password?</button>
            <div className="signin-divider signin-enter"><span/>or continue with<span/></div>
            <div className="signin-social signin-enter">{(['google', 'apple'] as const).map(provider => <button key={provider} type="button" disabled={!!busy} aria-label={`Continue with ${provider === 'google' ? 'Google' : 'Apple'}`} aria-disabled={provider === 'apple' && !mobileProviders.apple || undefined}
              onClick={() => { if (provider === 'apple' && !mobileProviders.apple) { feedback(signInError(new Error('provider-disabled'))); return; } void authenticate(provider, () => mobileSocialSignIn(provider)); }}><span><SocialIcon provider={provider}/></span>{provider === 'google' ? 'Google' : 'Apple'}</button>)}</div>
            <p className="signin-signup signin-enter"><span>New to AfroBooks? </span><Link href={signupHref}>Sign up</Link></p></>}
          {recoveryOpen && <div className="signin-recovery-back signin-enter"><button type="button" disabled={!!busy} onClick={backToSignIn}><ArrowLeft size={14}/>Back to sign in</button>{!recoveryAccount && <p>Phone numbers only help recover an account that already has this number linked.</p>}</div>}
          <p className="signin-legal signin-enter"><Link href="/terms">Terms</Link><span aria-hidden="true">·</span><Link href="/privacy">Privacy</Link></p>
        </>}
      </div>
    </section>
    <div ref={challenge} className="signin-recaptcha"/>
  </main>;
}
