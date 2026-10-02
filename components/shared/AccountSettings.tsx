'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, LockKeyhole, Trash2 } from 'lucide-react';
import { useReaderStore, THEME_STYLES, FONT_SIZE_PX, LINE_SPACING_VALUE, FONT_FAMILIES, type ReaderTheme, type FontSize, type LineSpacing } from '@/store/readerStore';
import { useAuthStore } from '@/store/authStore';
import { useBuyerDrawerStore, useSellerDrawerStore } from '@/store/profileDrawerStore';
import { changePassword } from '@/lib/firebase/auth';
import { useDeleteAccount } from '@/hooks/useDeleteAccount';
import PasswordInput from '@/components/shared/PasswordInput';
import { buttonClass, inputClass, panelClass } from '../buyer/profile/profileSections';

export default function AccountSettings({ seller = false }: { seller?: boolean }) {
  const prefs = useReaderStore();
  const firebaseUser = useAuthStore(s => s.firebaseUser);
  const closeBuyer = useBuyerDrawerStore(s => s.close);
  const closeSeller = useSellerDrawerStore(s => s.close);
  const close = seller ? closeSeller : closeBuyer;
  const { deletingAccount, deleteError, handleDeleteAccount } = useDeleteAccount(close);
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const usesPassword = firebaseUser?.providerData?.some(provider => provider.providerId === 'password');
  const theme = THEME_STYLES[prefs.theme];

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(''); setSuccess(false);
    if (password.next.length < 8) { setError('Choose a password with at least 8 characters.'); return; }
    if (password.next !== password.confirm) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try { await changePassword(password.current, password.next); setSuccess(true); setPassword({ current: '', next: '', confirm: '' }); }
    catch (failure) {
      const code = (failure as { code?: string })?.code;
      setError(code === 'auth/wrong-password' || code === 'auth/invalid-credential' ? 'Your current password is incorrect.'
        : code === 'auth/weak-password' ? 'Choose a stronger password with at least 8 characters.'
        : code === 'auth/too-many-requests' ? 'Too many attempts. Please wait and try again.'
        : code === 'auth/requires-recent-login' ? 'Sign in again before changing your password.'
        : 'Unable to change your password. Check your connection and try again.');
    } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div><h2 className="text-[26px] font-semibold tracking-tight">{seller ? 'Account settings' : 'Make yourself at home'}</h2><p className="mt-2 text-[14px] leading-relaxed text-[#a39f97]">{seller ? 'Manage your password and account.' : 'Adjust your reading experience and manage your account.'}</p></div>
    {!seller && <section className={`${panelClass} space-y-5`} aria-labelledby="reading-settings-title">
      <div><h3 id="reading-settings-title" className="font-semibold">Reading appearance</h3><p className="mt-1 text-[12px] leading-relaxed text-[#a39f97]">Changes apply to the reader and save automatically on this device.</p></div>
      <fieldset><legend className="mb-3 text-[14px] text-[#c6c2b8]">Page theme</legend>
        <div className="grid grid-cols-4 gap-2">{(Object.keys(THEME_STYLES) as ReaderTheme[]).map(key => <label key={key} className="relative cursor-pointer">
          <input type="radio" name="reader-page-theme" aria-label={THEME_STYLES[key].label} value={key} checked={prefs.theme === key} onChange={() => prefs.setTheme(key)} className="peer sr-only" />
          <span className="flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-transparent p-1 text-[12px] peer-checked:border-[#f5b800] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#f5b800]" style={{ background: THEME_STYLES[key].bg, color: THEME_STYLES[key].text }}><span className="font-serif text-xl">Aa</span>{THEME_STYLES[key].label}</span>
        </label>)}</div>
      </fieldset>
      <div className="grid grid-cols-1 gap-4 min-[380px]:grid-cols-2">
        <div><label htmlFor="reader-font-size" className="mb-2 block text-[14px] text-[#c6c2b8]">Text size</label><select id="reader-font-size" value={prefs.fontSize} onChange={e => prefs.setFontSize(e.target.value as FontSize)} className={inputClass}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="xlarge">Extra large</option></select></div>
        <div><label htmlFor="reader-line-spacing" className="mb-2 block text-[14px] text-[#c6c2b8]">Line spacing</label><select id="reader-line-spacing" value={prefs.lineSpacing} onChange={e => prefs.setLineSpacing(e.target.value as LineSpacing)} className={inputClass}><option value="compact">Compact</option><option value="normal">Normal</option><option value="relaxed">Relaxed</option></select></div>
      </div>
      <div className="overflow-hidden rounded-xl border p-4" style={{ background: theme.bg, color: theme.text, borderColor: theme.border }}>
        <p className="mb-3 text-[10px] uppercase tracking-[0.15em] opacity-70">Reading preview</p>
        <p style={{ fontSize: FONT_SIZE_PX[prefs.fontSize], lineHeight: LINE_SPACING_VALUE[prefs.lineSpacing], fontFamily: FONT_FAMILIES[prefs.fontFamily] }}>A good story begins with a moment of curiosity. Turn the page, and find a world of your own.</p>
      </div>
    </section>}
    <section className={`${panelClass} space-y-3`} aria-labelledby="security-settings-title">
      <h3 id="security-settings-title" className="flex items-center gap-2 font-semibold"><LockKeyhole size={17} className="text-[#c1a56c]" />Account security</h3>
      {usesPassword ? <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-[14px] text-[#c6c2b8] focus-visible:outline focus-visible:outline-[#f5b800] [&::-webkit-details-marker]:hidden">Change password<ChevronDown size={16} className="transition-transform group-open:rotate-180" /></summary>
        <form onSubmit={savePassword} className="space-y-4 border-t border-white/10 pt-4">
          {([{ key: 'current', label: 'Current password' }, { key: 'next', label: 'New password' }, { key: 'confirm', label: 'Confirm new password' }] as const).map(({ key, label }) => <div key={key}>
            <label htmlFor={`buyer-password-${key}`} className="mb-2 block text-[14px] text-[#c6c2b8]">{label}</label>
            <PasswordInput id={`buyer-password-${key}`} className="!text-[16px]" autoComplete={key === 'current' ? 'current-password' : 'new-password'} minLength={key === 'current' ? undefined : 8} required disabled={busy} value={password[key]} onChange={e => { setPassword({ ...password, [key]: e.target.value }); setSuccess(false); }} />
          </div>)}
          {error && <p role="alert" className="text-[14px] text-red-300">{error}</p>}
          {success && <p role="status" className="flex items-center gap-2 text-[14px] text-emerald-300"><Check size={16} />Password updated</p>}
          <button type="submit" disabled={busy} className={`${buttonClass} bg-[#e8442a] text-white hover:bg-[#ce3a23]`}>{busy ? 'Updating…' : 'Update password'}</button>
        </form>
      </details> : <p className="text-[14px] leading-relaxed text-[#a39f97]">You sign in through a linked provider. Manage your password with that provider.</p>}
    </section>
    <div className="flex flex-wrap gap-2"><Link href="/about-help" onClick={close} className={`${buttonClass} !px-2 text-[#a39f97] underline decoration-white/20 underline-offset-4`}>About & Help</Link><Link href="/privacy" onClick={close} className={`${buttonClass} !px-2 text-[#a39f97] underline decoration-white/20 underline-offset-4`}>Privacy information</Link><Link href="/terms" onClick={close} className={`${buttonClass} !px-2 text-[#a39f97] underline decoration-white/20 underline-offset-4`}>Terms of use</Link></div>
    <details className="group rounded-2xl border border-white/10 p-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-[14px] text-[#a39f97] focus-visible:outline focus-visible:outline-[#f5b800] [&::-webkit-details-marker]:hidden">Delete account<ChevronDown size={16} className="transition-transform group-open:rotate-180" /></summary>
      <p className="mb-4 mt-2 text-[14px] leading-relaxed text-[#a39f97]">{seller ? 'Permanently remove your account and authored books. This cannot be undone. Payment and dispute records may be retained.' : 'Permanently remove your account and library access, including purchased books. This cannot be undone. Payment and dispute records may be retained.'}</p>
      {deleteError && <p role="alert" className="mb-3 text-[14px] text-red-300">{deleteError}</p>}
      <button type="button" disabled={deletingAccount} onClick={handleDeleteAccount} className={`${buttonClass} border border-red-400/30 text-red-300 hover:bg-red-400/10`}><Trash2 size={16} />{deletingAccount ? 'Deleting…' : 'Delete my account'}</button>
    </details>
  </div>;
}
