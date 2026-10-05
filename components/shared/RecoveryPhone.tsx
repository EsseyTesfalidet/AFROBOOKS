'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Smartphone } from 'lucide-react';
import { getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import { useAuthStore } from '@/store/authStore';
import { beginAuthFlow } from '@/lib/auth/flow';
import { mobileProviders, mobileSmsCountries, normalizePhone, isSupportedSmsNumber } from '@/lib/auth/mobileSignIn';
import { recoveryPhoneError, type RecoveryPhoneStatus, type RecoveryProvider } from '@/lib/auth/recoveryPhone';
import { createPhoneVerifier } from '@/lib/firebase/mobileAuth';
import { confirmRecoveryIdentity, requestRecoveryCode, confirmRecoveryCode, getRecoveryPhone } from '@/lib/firebase/recoveryPhone';
import PasswordInput from './PasswordInput';
import './recovery-phone.css';

const names = new Intl.DisplayNames(['en'], { type: 'region' });

export default function RecoveryPhone({ uid }: { uid: string }) {
  const id = useId();
  const [data, setData] = useState<RecoveryPhoneStatus | null>(null);
  const [phase, setPhase] = useState<'start' | 'identity' | 'phone' | 'code'>('start');
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [busy, setBusy] = useState(''); const [password, setPassword] = useState('');
  const [country, setCountry] = useState<CountryCode>('NG'); const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState(''); const [code, setCode] = useState('');
  const [remaining, setRemaining] = useState(0); const [linkedPendingSync, setLinkedPendingSync] = useState(false);
  const mounted = useRef(true); const locked = useRef(false); const deadline = useRef(0);
  const linked = useRef(false); const challenge = useRef<HTMLDivElement>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null); const confirmation = useRef<ConfirmationResult | null>(null);
  const cooldownKey = `afrobooks:phone-link-retry:${uid}`;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    try { deadline.current = Math.min(Number(sessionStorage.getItem(cooldownKey)) || 0, Date.now() + 30000); } catch { /* Storage is optional. */ }
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    tick(); const timer = setInterval(tick, 500);
    getRecoveryPhone(uid).then(result => { if (active) setData(result); }).catch(() => { if (active) setError('Unable to check your recovery phone. Please refresh its status.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; clearInterval(timer); verifier.current?.clear(); verifier.current = null; confirmation.current = null; };
  }, [uid, cooldownKey]);

  function saveStatus(result: RecoveryPhoneStatus) {
    if (!mounted.current) return;
    setData(result); setLinkedPendingSync(false); linked.current = false;
    const profile = useAuthStore.getState().userProfile;
    if (result.profileSynced && result.phoneNumber && profile?.uid === uid) useAuthStore.getState().setUserProfile({ ...profile, phone: result.phoneNumber });
  }
  async function run(kind: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(kind); setError('');
    try { await action(); }
    catch (failure) {
      if (!mounted.current) return;
      if (/PHONE_REAUTH_REQUIRED|requires-recent-login/.test(String(failure))) { setPhase('identity'); confirmation.current = null; setCode(''); }
      setError(linked.current ? 'Your phone was linked, but account details could not refresh. Retry below; you do not need another code.' : recoveryPhoneError(failure));
    } finally { locked.current = false; if (mounted.current) setBusy(''); }
  }
  function confirmIdentity(provider: RecoveryProvider) {
    void run('identity', async () => {
      const finish = beginAuthFlow();
      try {
        await confirmRecoveryIdentity(uid, provider, password);
        if (mounted.current) setPhase('phone');
      } finally { finish(); if (mounted.current) setPassword(''); }
    });
  }
  function sendCode() {
    if (Date.now() < deadline.current) return;
    const number = phase === 'code' ? sentTo : normalizePhone(phone, country);
    if (!number) { setError('Enter a valid phone number.'); return; }
    if (!isSupportedSmsNumber(number)) { setError(recoveryPhoneError(new Error('sms-region-not-allowed'))); return; }
    void run('send', async () => {
      if (!challenge.current) return;
      verifier.current?.clear(); verifier.current = createPhoneVerifier(challenge.current);
      try {
        const result = await requestRecoveryCode(uid, number, verifier.current);
        if (!mounted.current) return;
        confirmation.current = result; setSentTo(number); setCode(''); setPhase('code');
        deadline.current = Date.now() + 30000; setRemaining(30);
        try { sessionStorage.setItem(cooldownKey, String(deadline.current)); } catch { /* Storage is optional. */ }
      } finally { verifier.current?.clear(); verifier.current = null; }
    });
  }
  function verifyCode() {
    const pending = confirmation.current;
    if (!pending || !/^\d{6}$/.test(code)) return;
    void run('verify', async () => {
      const finish = beginAuthFlow();
      try {
        await confirmRecoveryCode(uid, pending, code);
        linked.current = true;
        if (mounted.current) { setLinkedPendingSync(true); setCode(''); }
        confirmation.current = null;
        saveStatus(await getRecoveryPhone(uid, true));
      } finally { finish(); }
    });
  }
  function cancel() { confirmation.current = null; setPhase('start'); setPassword(''); setCode(''); setError(''); }
  const syncNeeded = linkedPendingSync || !!data?.phoneNumber && !data.profileSynced;

  return <section className="recovery-phone" aria-labelledby={`${id}-title`} aria-busy={!!busy || loading}>
    <h3 id={`${id}-title`}><Smartphone size={18} aria-hidden="true" />Recovery phone</h3>
    <p>Link a number you control so a text message code can open this same account and purchased library.</p>
    {loading ? <p role="status">Checking your sign-in methods…</p> : <>
      {data?.phoneNumber ? <div className="recovery-phone-linked"><strong><Check size={17} aria-hidden="true" />Verified for sign-in</strong><span>{data.phoneNumber}</span><p>Choose Phone on the sign-in screen to return to this account.</p></div> : linkedPendingSync ? <p role="status">Phone verified. Your account and library stay together.</p> : data && <>
        {phase === 'start' && <>{mobileProviders.phone ? <button type="button" className="recovery-phone-primary" disabled={!!busy || !data.providers.length} onClick={() => { setPhase('identity'); setError(''); }}>Link recovery phone</button> : <p>Phone linking is currently unavailable.</p>}{!data.providers.length && <p>Sign in with your existing provider again to manage account recovery.</p>}</>}
        {phase === 'identity' && <div className="recovery-phone-step"><h4>Confirm your existing sign-in</h4><p>This protects your account before adding another way to sign in.</p>
          {data.providers.includes('password') && <form onSubmit={event => { event.preventDefault(); confirmIdentity('password'); }}>
            <label htmlFor={`${id}-password`}>Current password</label><PasswordInput id={`${id}-password`} autoComplete="current-password" value={password} required disabled={!!busy} onChange={event => setPassword(event.target.value)} />
            <button className="recovery-phone-primary" disabled={!!busy || !password}>{busy === 'identity' ? 'Confirming…' : 'Confirm password'}</button>
          </form>}
          {data.providers.filter(provider => provider !== 'password').map(provider => <button key={provider} type="button" disabled={!!busy} onClick={() => confirmIdentity(provider)}>Confirm with {provider === 'google.com' ? 'Google' : 'Apple'}</button>)}
        </div>}
        {phase === 'phone' && <form onSubmit={event => { event.preventDefault(); sendCode(); }}>
          <label htmlFor={`${id}-country`}>Country code</label><select id={`${id}-country`} value={country} disabled={!!busy} onChange={event => setCountry(event.target.value as CountryCode)}>{mobileSmsCountries.map(value => <option key={value} value={value}>{names.of(value)} (+{getCountryCallingCode(value)})</option>)}</select>
          <label htmlFor={`${id}-phone`}>Recovery phone number</label><input id={`${id}-phone`} type="tel" autoComplete="tel" value={phone} disabled={!!busy} required onChange={event => setPhone(event.target.value)} />
          <p>By sending a code, you agree to receive a verification text and let Google process your number for abuse prevention. Message rates may apply.</p>
          <button className="recovery-phone-primary" disabled={!!busy || remaining > 0}>{busy === 'send' ? 'Sending…' : remaining > 0 ? `Try again in ${remaining}s` : 'Send verification code'}</button>
        </form>}
        {phase === 'code' && <form onSubmit={event => { event.preventDefault(); verifyCode(); }}>
          <p>Enter the six-digit code sent to <strong>{sentTo}</strong>.</p>
          <label htmlFor={`${id}-code`}>Verification code</label><input id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} disabled={!!busy} required onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
          <button className="recovery-phone-primary" disabled={!!busy || code.length !== 6}>{busy === 'verify' ? 'Linking…' : 'Verify and link phone'}</button>
          <div className="recovery-phone-actions"><button type="button" disabled={!!busy || remaining > 0} onClick={sendCode}>{remaining > 0 ? `Resend in ${remaining}s` : 'Resend code'}</button><button type="button" disabled={!!busy} onClick={() => { confirmation.current = null; setCode(''); setError(''); setPhase('phone'); }}>Change number</button></div>
        </form>}
        {phase !== 'start' && <button type="button" disabled={!!busy} onClick={cancel}>Cancel linking</button>}
      </>}
      {syncNeeded && <button type="button" disabled={!!busy} onClick={() => void run('sync', async () => saveStatus(await getRecoveryPhone(uid, true)))}>Refresh account details</button>}
      <button type="button" className="recovery-phone-refresh" disabled={!!busy} onClick={() => void run('refresh', async () => saveStatus(await getRecoveryPhone(uid)))}>Refresh phone status</button>
    </>}
    {error && <p className="recovery-phone-error" role="alert">{error}</p>}
    <div ref={challenge} />
  </section>;
}
