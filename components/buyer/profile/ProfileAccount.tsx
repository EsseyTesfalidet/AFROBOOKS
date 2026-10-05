'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BookOpen, Check, ChevronRight, Clapperboard, Pencil } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import { updateUserProfile } from '@/lib/firebase/auth';
import { hasAuthorWorkspace } from '@/lib/utils/workspace';
import AvatarUpload from '@/components/shared/AvatarUpload';
import { PROFILE_SECTIONS, buttonClass, inputClass, panelClass } from './profileSections';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { AUTHOR_APP_START, authorWebsiteHref } from '@/lib/app/authorWebsite';
import { useAndroidDevice } from '@/hooks/useAndroidDevice';

export default function ProfileAccount() {
  const user = useAuthStore(s => s.userProfile)!;
  const close = useBuyerDrawerStore(s => s.close);
  const setSection = useBuyerDrawerStore(s => s.setSection);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '', bio: '' });
  const author = hasAuthorWorkspace(user);
  const installed = useInstalledApp();
  const android = useAndroidDevice();

  function editProfile() {
    setForm({ firstName: user.firstName ?? '', lastName: user.lastName ?? '', username: user.username ?? '', bio: user.bio ?? '' });
    setError(''); setSaved(false); setEditing(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const changes = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), username: form.username.trim(), bio: form.bio.trim() };
    if (!changes.firstName) { setError('Enter your first name.'); return; }
    if (changes.username && !/^[a-zA-Z0-9_.-]{3,30}$/.test(changes.username)) { setError('Use 3–30 letters, numbers, dots, dashes or underscores for your username.'); return; }
    setBusy(true); setError(''); setSaved(false);
    try {
      await updateUserProfile(user.uid, changes);
      const current = useAuthStore.getState().userProfile;
      if (current?.uid === user.uid) useAuthStore.getState().setUserProfile({ ...current, ...changes });
      setEditing(false); setSaved(true);
    } catch { setError('Your changes could not be saved. Please try again.'); }
    finally { setBusy(false); }
  }
  async function openAuthorWorkspace() {
    if (workspaceBusy) return;
    setWorkspaceBusy(true); setError('');
    try {
      const changes = { activeRole: 'seller' as const };
      await updateUserProfile(user.uid, changes);
      const current = useAuthStore.getState().userProfile;
      if (current?.uid !== user.uid) return;
      useAuthStore.getState().setUserProfile({ ...current, ...changes });
      close(); router.push('/dashboard');
    } catch { setError('Unable to open your author account. Please try again.'); }
    finally { setWorkspaceBusy(false); }
  }
  return <div className="space-y-6">
    <div className="flex items-center gap-4">
      <AvatarUpload size={72} />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[12px] text-[#c1a56c]">Reader profile</p>
        <h2 className="break-words text-[26px] font-semibold tracking-tight">{[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Your profile'}</h2>
        {user.username && <p className="mt-1 break-all text-[14px] text-[#a39f97]">@{user.username}</p>}
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-[14px] text-red-300">{error}</p>}
    {saved && <p role="status" className="flex items-center gap-2 text-[14px] text-emerald-300"><Check size={16} />Profile saved</p>}
    {editing ? <form onSubmit={save} className={`${panelClass} space-y-4`}>
      <h3 className="text-base font-semibold">Edit your profile</h3>
      <div className="grid grid-cols-1 gap-4 min-[380px]:grid-cols-2">
        {(['firstName', 'lastName'] as const).map(key => <div key={key}>
          <label htmlFor={`buyer-${key}`} className="mb-2 block text-[14px] text-[#c6c2b8]">{key === 'firstName' ? 'First name' : 'Last name'}</label>
          <input id={`buyer-${key}`} autoComplete={key === 'firstName' ? 'given-name' : 'family-name'} value={form[key]} maxLength={80} required={key === 'firstName'} disabled={busy} onChange={e => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
        </div>)}
      </div>
      <div><label htmlFor="buyer-username" className="mb-2 block text-[14px] text-[#c6c2b8]">Username <span className="text-[#8d897f]">(optional)</span></label>
        <input id="buyer-username" autoComplete="username" value={form.username} maxLength={30} disabled={busy} onChange={e => setForm({ ...form, username: e.target.value })} className={inputClass} />
      </div>
      <div><label htmlFor="buyer-bio" className="mb-2 block text-[14px] text-[#c6c2b8]">About you <span className="text-[#8d897f]">(optional)</span></label>
        <textarea id="buyer-bio" rows={3} maxLength={500} value={form.bio} disabled={busy} onChange={e => setForm({ ...form, bio: e.target.value })} placeholder="What do you like to read?" className={`${inputClass} resize-y`} />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={busy} className={`${buttonClass} bg-[#e8442a] text-white hover:bg-[#ce3a23]`}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }} className={`${buttonClass} text-[#c6c2b8] hover:bg-white/5`}>Cancel</button>
      </div>
    </form> : <section className="space-y-4">
      <h3 className="sr-only">Personal details</h3>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="mb-1.5 text-[12px] text-[#a39f97]">Email</p><p className="break-all text-[14px]">{user.email}</p></div>
        <button type="button" onClick={editProfile} className={`${buttonClass} !px-3 text-[#ff977f] hover:bg-white/5`}><Pencil size={14} />Edit profile</button>
      </div>
      {user.bio && <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[#a39f97]">{user.bio}</p>}
    </section>}
    {user.subscriptionId && <section className={`${panelClass} flex items-center justify-between gap-3`}>
      <div><p className="text-[14px] font-semibold capitalize">{user.subscriptionPlan} subscription</p><p className="mt-1 text-[12px] capitalize text-[#a39f97]">{user.subscriptionStatus.replace('_', ' ')}</p></div>
      <Link href="/subscription" onClick={close} className={`${buttonClass} border border-white/15`}>Manage</Link>
    </section>}
    {!editing && <nav aria-label="Account sections" className="divide-y divide-white/10 border-y border-white/10">
      {installed && <a href={authorWebsiteHref(android, 'video')} onClick={close} {...(!android ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="flex min-h-16 items-center gap-4 rounded-lg px-1 py-4 text-[14px] transition-colors hover:text-[#c1a56c] focus-visible:outline focus-visible:outline-[#f5b800]"><Clapperboard size={18} className="text-[#a39f97]" /><span className="flex-1">Creator Studio<span className="mt-1 block text-[12px] text-[#a39f97]">Upload and manage your videos</span></span><ArrowUpRight size={16} className="text-[#8d897f]" /></a>}
      <Link href="/library" onClick={close} className="flex min-h-16 items-center gap-4 rounded-lg px-1 py-4 text-[14px] transition-colors hover:text-[#c1a56c] focus-visible:outline focus-visible:outline-[#f5b800]"><BookOpen size={18} className="text-[#a39f97]" /><span className="flex-1">My library</span><ChevronRight size={16} className="text-[#8d897f]" /></Link>
      {PROFILE_SECTIONS.filter(item => item.id !== 'account').map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => setSection(id)} className="flex min-h-16 w-full items-center gap-4 rounded-lg px-1 py-4 text-left text-[14px] transition-colors hover:text-[#c1a56c] focus-visible:outline focus-visible:outline-[#f5b800]"><Icon size={18} className="text-[#a39f97]" /><span className="flex-1">{id === 'wishlist' ? 'Saved books' : id === 'reviews' ? 'My reviews' : id === 'settings' ? 'Reading & account settings' : label}</span><ChevronRight size={16} className="text-[#8d897f]" /></button>)}
    </nav>}
    {!editing && (installed ? <div><Link href={AUTHOR_APP_START} onClick={close} className="flex min-h-11 items-center gap-2 text-[14px] text-[#c1a56c] hover:underline">{author ? 'My author space' : 'Become an author'}<ChevronRight size={16} /></Link><p className="text-[12px] text-[#a39f97]">Open your author space and return to reading any time.</p></div> : author && <button type="button" onClick={openAuthorWorkspace} disabled={workspaceBusy} className="flex min-h-11 items-center gap-2 text-[14px] text-[#c1a56c] hover:underline disabled:opacity-50">{workspaceBusy ? 'Opening…' : 'Open author workspace'}<ArrowUpRight size={16} /></button>)}
  </div>;
}
