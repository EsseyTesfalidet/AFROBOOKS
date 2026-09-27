'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ChevronRight, CheckCircle, Circle } from 'lucide-react';
import { doc, getDoc, getDocs, collection, query, where, orderBy, limit, addDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/config';
import { authenticatedPost } from '@/lib/firebase/request';
import { updateUserProfile } from '@/lib/firebase/auth';
import { getSellerPublishedBooksCount } from '@/lib/firebase/firestore';
import { canSubmitSellerIdVerification, SELLER_BOOKS_BEFORE_ID_VERIFICATION } from '@/lib/sellerVerification';
import { useAuthStore } from '@/store/authStore';
import { useSellerDrawerStore } from '@/store/profileDrawerStore';
import AvatarUpload from '@/components/shared/AvatarUpload';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import AccountSettings from '@/components/shared/AccountSettings';
import type { Seller } from '@/types/user';
import AuthorPayouts from './AuthorPayouts';

const inputClass = 'w-full min-h-11 rounded-lg border border-white/15 bg-[#1b1a17] px-3 py-2 text-[16px]';
const actionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-medium disabled:opacity-50';
const primaryClass = actionClass + ' bg-[#ed6647] text-[#160e0b] hover:bg-[#ff8b6f]';
const emptyLinks = { twitter: '', instagram: '', linkedin: '', goodreads: '' };

export default function SellerProfileContent({ section }: { section: string }) {
  const uid = useAuthStore(state => state.userProfile?.uid);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!uid || section === 'security') return;
    let active = true;
    setLoading(true); setError('');
    getDoc(doc(db, 'sellers', uid)).then(snapshot => {
      if (!active) return;
      if (!snapshot.exists()) throw new Error('Author account unavailable.');
      setSeller(snapshot.data() as Seller);
    }).catch(() => { if (active) setError('Your author details could not be loaded. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uid, attempt, section]);

  if (section === 'security') return <AccountSettings seller />;
  if (loading) return <div role="status" className="flex items-center gap-3 py-8 text-[14px] text-[#a8a49c]"><LoadingSpinner size={22} /> Loading author details…</div>;
  if (error || !seller) return <div role="alert" className="text-[14px]"><p className="text-red-300">{error || 'Author details unavailable.'}</p><button onClick={() => setAttempt(value => value + 1)} className={actionClass + ' mt-3 text-[#ff9e83] underline'}>Try again</button></div>;
  if (section === 'verification') return <Verification seller={seller} />;
  if (section === 'payout') return <PayoutSettings seller={seller} onUpdate={setSeller} />;
  return <AuthorIdentity seller={seller} onUpdate={setSeller} />;
}

function AuthorIdentity({ seller, onUpdate }: { seller: Seller; onUpdate: (seller: Seller) => void }) {
  const user = useAuthStore(state => state.userProfile)!;
  const { setSection, close } = useSellerDrawerStore();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const currentForm = () => ({ penName: seller.penName ?? '', bio: user.bio ?? '', website: seller.website ?? '', ...emptyLinks, ...seller.socialLinks });
  const [form, setForm] = useState(currentForm);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setSaved(false);
    const socialLinks = { twitter: form.twitter.trim(), instagram: form.instagram.trim(), linkedin: form.linkedin.trim(), goodreads: form.goodreads.trim() };
    const fields = { penName: form.penName.trim() || null, bio: form.bio.trim(), website: form.website.trim(), socialLinks };
    try {
      await authenticatedPost('/api/seller/profile', fields);
      const latest = useAuthStore.getState().userProfile;
      if (latest?.uid !== user.uid) return;
      useAuthStore.getState().setUserProfile({ ...latest, bio: fields.bio });
      onUpdate({ ...seller, penName: fields.penName, website: fields.website, socialLinks });
      setEditing(false); setSaved(true);
    } catch { setError('Your profile could not be saved. Please try again.'); }
    finally { setBusy(false); }
  }
  async function openReader() {
    setSwitching(true); setError('');
    try {
      await updateUserProfile(user.uid, { activeRole: 'buyer' });
      const latest = useAuthStore.getState().userProfile;
      if (latest?.uid !== user.uid) return;
      useAuthStore.getState().setUserProfile({ ...latest, activeRole: 'buyer' });
      close(); router.push('/browse');
    } catch { setError('Unable to open your reader account. Please try again.'); }
    finally { setSwitching(false); }
  }

  return <div className="space-y-6">
    <div className="flex items-center gap-4"><AvatarUpload size={72} /><div className="min-w-0"><p className="text-[12px] text-[#c5a56a]">{seller.isVerified ? 'Verified author' : 'Author profile'}</p><h2 className="mt-1 break-words text-[25px] font-semibold leading-tight">{seller.penName || `${user.firstName} ${user.lastName}`}</h2><p className="mt-2 break-words text-[14px] text-[#a8a49c]">@{user.username || 'author'}</p></div></div>
    {error && <p role="alert" className="text-[14px] text-red-300">{error}</p>}
    {saved && <p role="status" className="text-[14px] text-emerald-300">Author profile saved.</p>}
    {editing ? <form onSubmit={save} className="space-y-4">
      <div><label htmlFor="author-pen-name" className="mb-2 block text-[12px] text-[#b4b1a9]">Pen name (optional)</label><input id="author-pen-name" value={form.penName} maxLength={120} disabled={busy} onChange={event => setForm({ ...form, penName: event.target.value })} className={inputClass} /></div>
      <div><label htmlFor="author-bio" className="mb-2 block text-[12px] text-[#b4b1a9]">Author bio</label><textarea id="author-bio" value={form.bio} maxLength={5000} rows={5} disabled={busy} onChange={event => setForm({ ...form, bio: event.target.value })} className={inputClass} /><p className="mt-1 text-[12px] text-[#96938b]">Tell readers about your writing. At least 50 characters count toward verification.</p></div>
      <div><label htmlFor="author-website" className="mb-2 block text-[12px] text-[#b4b1a9]">Website (optional)</label><input id="author-website" type="url" placeholder="https://" value={form.website} maxLength={500} disabled={busy} onChange={event => setForm({ ...form, website: event.target.value })} className={inputClass} /></div>
      <details><summary className="min-h-11 cursor-pointer py-3 text-[14px] text-[#b4b1a9]">Social links (optional)</summary><div className="space-y-4 pt-3">{(['twitter','instagram','linkedin','goodreads'] as const).map(key => <div key={key}><label htmlFor={`author-${key}`} className="mb-2 block text-[12px] capitalize text-[#b4b1a9]">{key === 'twitter' ? 'X / Twitter' : key}</label><input id={`author-${key}`} maxLength={500} value={form[key]} disabled={busy} onChange={event => setForm({ ...form, [key]: event.target.value })} className={inputClass} /></div>)}</div></details>
      <div className="flex gap-3"><button type="submit" disabled={busy} className={primaryClass}>{busy ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }} className={actionClass + ' text-[#b4b1a9]'}>Cancel</button></div>
    </form> : <>
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="text-[12px] text-[#96938b]">Email</p><p className="mt-1 break-all text-[14px]">{user.email}</p></div><button onClick={() => { setForm(currentForm()); setEditing(true); setSaved(false); setError(''); }} className={actionClass + ' !px-0 text-[#ff9e83]'}>Edit profile</button></div>
      <p className="text-[14px] leading-relaxed text-[#a8a49c]">{user.bio || 'Add a bio to introduce yourself to readers.'}</p>
      <div className="divide-y divide-white/10 border-y border-white/10 text-[14px]">
        <Link href={`/author/${user.uid}`} onClick={close} className="flex min-h-16 items-center justify-between gap-3">View public author page <ArrowUpRight size={17} /></Link>
        {[{id:'verification',label:'Author verification'},{id:'payout',label:'Payout & tax details'},{id:'security',label:'Account settings'}].map(item => <button key={item.id} onClick={() => setSection(item.id)} className="flex min-h-16 w-full items-center justify-between gap-3 text-left hover:text-[#ff9e83]">{item.label}<ChevronRight size={17} className="text-[#96938b]" /></button>)}
        <Link href="/analytics" onClick={close} className="flex min-h-16 items-center justify-between gap-3">Sales & earnings <ArrowUpRight size={17} /></Link>
      </div>
      <button onClick={openReader} disabled={switching} className={actionClass + ' !px-0 text-[#a8a49c]'}>{switching ? 'Opening…' : 'Open reader account'}<ArrowUpRight size={15} /></button>
    </>}
  </div>;
}

function Verification({ seller }: { seller: Seller }) {
  const user = useAuthStore(state => state.userProfile)!;
  const firebaseUser = useAuthStore(state => state.firebaseUser);
  const [data, setData] = useState<{ count: number; request: { status: string; reviewNote?: string } | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null); setLoadError('');
    Promise.all([getSellerPublishedBooksCount(user.uid), getDocs(query(collection(db, 'verificationRequests'), where('sellerId','==',user.uid),orderBy('submittedAt','desc'),limit(1)))]).then(([count,snapshot]) => {
      if (active) setData({count,request:snapshot.empty ? null : snapshot.docs[0].data() as {status:string;reviewNote?:string}});
    }).catch(()=>{if(active)setLoadError('Verification details could not be loaded. Please try again.');});
    return ()=>{active=false;};
  },[user.uid,attempt]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || busy || !data || !canSubmitSellerIdVerification(data.count)) return;
    setBusy(true);setError('');
    try {
      const object = ref(storage, `verification/${user.uid}/id_${Date.now()}_${file.name}`);
      await uploadBytes(object,file);
      await addDoc(collection(db,'verificationRequests'),{sellerId:user.uid,sellerName:`${user.firstName} ${user.lastName}`,sellerEmail:user.email,filePath:object.fullPath,status:'pending',submittedAt:serverTimestamp(),reviewedAt:null,reviewNote:null});
      setData({...data,request:{status:'pending'}});setFile(null);
    } catch {setError('Your ID could not be submitted. Please try again.');}
    finally {setBusy(false);}
  }
  const steps = [
    {label:'Email verified',done:firebaseUser?.emailVerified === true},
    {label:'Author bio added',done:(user.bio?.trim().length ?? 0)>=50},
    {label:'First book published',done:seller.verificationStatus?.firstBookPublished},
    {label:'ID verified',done:seller.verificationStatus?.idVerified},
    {label:'10 sales reached',done:(seller.totalSales ?? 0)>=10},
  ];
  return <div className="space-y-6"><div><h2 className="text-[24px] font-semibold">Author verification</h2><p className="mt-3 text-[14px] leading-relaxed text-[#a8a49c]">You can publish your first {SELLER_BOOKS_BEFORE_ID_VERIFICATION} books before ID verification is required.</p></div>
    <ul className="space-y-4">{steps.map(step=><li key={step.label} className="flex items-center gap-3 text-[14px]">{step.done?<CheckCircle size={18} className="text-emerald-300"/>:<Circle size={18} className="text-[#96938b]"/>}{step.label}<span className="sr-only">{step.done?'Complete':'Incomplete'}</span></li>)}</ul>
    {loadError?<div role="alert"><p className="text-[14px] text-red-300">{loadError}</p><button className={actionClass+' text-[#ff9e83] underline'} onClick={()=>setAttempt(value=>value+1)}>Try again</button></div>:!data?<p role="status" className="text-[14px] text-[#a8a49c]">Loading verification details…</p>:!seller.verificationStatus?.idVerified && (
      data.request?.status==='pending' ? <p role="status" className="text-[14px] text-amber-200">Your ID is under review. No further upload is needed.</p> :
      !canSubmitSellerIdVerification(data.count) ? <p className="text-[14px] leading-relaxed text-[#a8a49c]">ID upload becomes available after your first {SELLER_BOOKS_BEFORE_ID_VERIFICATION} published or submitted books.</p> :
      <form onSubmit={submit} className="space-y-4 border-t border-white/10 pt-5">
        {data.request?.status==='rejected' && <p className="text-[14px] text-amber-200">Your previous ID was not accepted. {data.request.reviewNote || 'Upload a clear replacement to resubmit.'}</p>}
        <label htmlFor="author-id" className="block text-[14px]">Government-issued ID</label>
        <input id="author-id" type="file" accept="image/*,application/pdf" disabled={busy} className="w-full text-[14px] text-[#b4b1a9]" onChange={event=>{const next=event.target.files?.[0];setFile(null);setError('');if(next){if(!(next.type.startsWith('image/')||next.type==='application/pdf')||next.size>=10*1024*1024){setError('Choose an image or PDF smaller than 10 MB.');event.target.value='';}else setFile(next);}}}/>
        <p className="text-[12px] text-[#96938b]">Image or PDF, under 10 MB. Only authorized staff can view the file.</p>
        {error&&<p role="alert" className="text-[14px] text-red-300">{error}</p>}
        <button disabled={!file||busy} className={primaryClass}>{busy?'Submitting…':'Submit ID'}</button>
      </form>
    )}
  </div>;
}

function PayoutSettings({ seller,onUpdate }: { seller: Seller; onUpdate:(seller:Seller)=>void }) {
  const user = useAuthStore(state=>state.userProfile)!;
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [taxType,setTaxType]=useState(seller.taxFormType ?? '');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if(!file||!taxType||busy)return;
    setBusy(true);setError('');
    try {
      await uploadBytes(ref(storage,`tax/${user.uid}/${file.name}`),file);
      await setDoc(doc(db,'sellers',user.uid),{taxFormType:taxType,taxFormStatus:'submitted'},{merge:true});
      onUpdate({...seller,taxFormType:taxType as Seller['taxFormType'],taxFormStatus:'submitted'});
      setFile(null);
    }catch{setError('Your tax form could not be submitted. Please try again.');}
    finally{setBusy(false);}
  }
  return <div className="space-y-7">
    <div><h2 className="text-[24px] font-semibold">Payout & tax details</h2><p className="mt-3 text-[14px] leading-relaxed text-[#a8a49c]">Keep your payment details ready. Payouts remain subject to account and balance review.</p></div>
    {error&&<p role="alert" className="text-[14px] text-red-300">{error}</p>}
    <AuthorPayouts />
    <section className="space-y-4 border-t border-white/10 pt-6"><h3 className="text-[16px] font-semibold">Tax documents</h3>
      {seller.taxFormStatus==='submitted'||seller.taxFormStatus==='approved'?<p role="status" className="text-[14px] text-emerald-300">{seller.taxFormType ? seller.taxFormType+' · ':''}{seller.taxFormStatus==='approved'?'Tax form approved':'Tax form submitted for review'}</p>:<form onSubmit={submit} className="space-y-4">
        <div><label htmlFor="tax-type" className="mb-2 block text-[14px]">Form type</label><select id="tax-type" required value={taxType} disabled={busy} onChange={event=>setTaxType(event.target.value)} className={inputClass}><option value="">Choose your form</option><option value="W-9">W-9</option><option value="W-8BEN">W-8BEN</option></select></div>
        <div><label htmlFor="tax-file" className="mb-2 block text-[14px]">Tax form</label><input id="tax-file" type="file" accept="application/pdf,image/*" disabled={busy} className="w-full text-[14px] text-[#b4b1a9]" onChange={event=>{const next=event.target.files?.[0];setFile(null);setError('');if(next){if(!(next.type.startsWith('image/')||next.type==='application/pdf')||next.size>=10*1024*1024){setError('Choose an image or PDF smaller than 10 MB.');event.target.value='';}else setFile(next);}}}/></div>
        <p className="text-[12px] text-[#96938b]">Image or PDF, under 10 MB. Only authorized staff can view the file.</p><button disabled={!file||!taxType||busy} className={primaryClass}>{busy?'Submitting…':'Submit tax form'}</button>
      </form>}
    </section>
  </div>;
}
