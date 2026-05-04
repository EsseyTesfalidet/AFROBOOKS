'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, LogOut, ExternalLink, CheckCircle, Circle, Upload, Clock, Plus, Trash2, UserPlus, Copy, BadgeCheck, Globe } from 'lucide-react';
import { useSellerDrawerStore } from '@/store/profileDrawerStore';
import { useAuthStore } from '@/store/authStore';
import { updateUserProfile, logOut, changePassword } from '@/lib/firebase/auth';
import { db, storage } from '@/lib/firebase/config';
import { doc, getDoc, setDoc, addDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import AvatarUpload from '@/components/shared/AvatarUpload';
import Toggle from '@/components/shared/Toggle';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import ProgressBar from '@/components/shared/ProgressBar';
import type { Seller } from '@/types/user';
import type { Book } from '@/types/book';

const SECTIONS = [
  { group: 'Identity', items: [
    { id: 'identity', label: 'Author Profile' },
    { id: 'preview', label: 'Preview' },
    { id: 'verification', label: 'Verification' },
  ]},
  { group: 'Publishing', items: [
    { id: 'coauthor', label: 'Co-Authors' },
  ]},
  { group: 'Money', items: [
    { id: 'payout', label: 'Payout' },
    { id: 'tax', label: 'Tax' },
    { id: 'earnings', label: 'Earnings' },
  ]},
  { group: 'Account', items: [
    { id: 'security', label: 'Security' },
    { id: 'notifications', label: 'Notifications' },
  ]},
];

const ALL_ITEMS = SECTIONS.flatMap((g) => g.items);

export default function SellerProfileDrawer() {
  const { isOpen, section, setSection, close } = useSellerDrawerStore();
  const router = useRouter();
  const { userProfile, setUserProfile } = useAuthStore();

  const [seller, setSeller] = useState<Seller | null>(null);
  const [loadingSeller, setLoadingSeller] = useState(false);
  const [form, setForm] = useState({ penName: '', website: '', bio: '', twitter: '', instagram: '', linkedin: '', goodreads: '' });
  const [saving, setSaving] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);

  const [idRequest, setIdRequest] = useState<{ status: string } | null>(null);
  const [idUploading, setIdUploading] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const idInputRef = useRef<HTMLInputElement>(null);

  const [coBooks, setCoBooks] = useState<Book[]>([]);
  const [coBooksLoading, setCoBooksLoading] = useState(false);
  const [coForm, setCoForm] = useState<Record<string, { name: string; email: string; share: string }>>({});
  const [coSaving, setCoSaving] = useState<string | null>(null);

  const [payouts, setPayouts] = useState<{ id: string; periodLabel: string; salesCount: number; amountCents: number; status: string }[]>([]);

  const [taxFile, setTaxFile] = useState<File | null>(null);
  const [taxUploading, setTaxUploading] = useState(false);
  const taxInputRef = useRef<HTMLInputElement>(null);

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState(userProfile?.notificationPreferences ?? {
    purchaseConfirmations: true, readingReminders: true, newChapterAlerts: true,
    reviewReplies: true, flashSales: true, recommendations: true,
    emailReceipts: true, weeklyDigest: false, promotionalEmails: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);

  // Load seller doc when drawer opens
  useEffect(() => {
    if (!isOpen || !userProfile) return;
    setLoadingSeller(true);
    getDoc(doc(db, 'sellers', userProfile.uid)).then((snap) => {
      if (snap.exists()) {
        const s = snap.data() as Seller;
        setSeller(s);
        setForm({
          penName: s.penName ?? '',
          website: s.website ?? '',
          bio: userProfile.bio ?? '',
          twitter: s.socialLinks?.twitter ?? '',
          instagram: s.socialLinks?.instagram ?? '',
          linkedin: s.socialLinks?.linkedin ?? '',
          goodreads: s.socialLinks?.goodreads ?? '',
        });
      }
      setLoadingSeller(false);
    });
    getDocs(query(collection(db, 'verificationRequests'), where('sellerId', '==', userProfile.uid))).then((snap) => {
      if (!snap.empty) setIdRequest(snap.docs[0].data() as { status: string });
    });
  }, [isOpen, userProfile?.uid]);

  useEffect(() => {
    if (!isOpen || section !== 'coauthor' || !userProfile) return;
    setCoBooksLoading(true);
    getDocs(query(collection(db, 'books'), where('sellerId', '==', userProfile.uid), where('status', '==', 'live')))
      .then((snap) => { setCoBooks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Book))); setCoBooksLoading(false); });
  }, [isOpen, section, userProfile?.uid]);

  useEffect(() => {
    if (!isOpen || section !== 'earnings' || !userProfile) return;
    getDocs(query(collection(db, 'payouts'), where('sellerId', '==', userProfile.uid))).then((snap) => {
      setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)));
    });
  }, [isOpen, section, userProfile?.uid]);

  async function saveProfile() {
    if (!userProfile) return;
    setSaving(true);
    await Promise.all([
      updateUserProfile(userProfile.uid, { bio: form.bio }),
      setDoc(doc(db, 'sellers', userProfile.uid), {
        uid: userProfile.uid,
        penName: form.penName || null,
        website: form.website,
        socialLinks: { twitter: form.twitter, instagram: form.instagram, linkedin: form.linkedin, goodreads: form.goodreads },
        stripeAccountId: seller?.stripeAccountId ?? null,
        stripeAccountStatus: seller?.stripeAccountStatus ?? 'not_connected',
        isVerified: seller?.isVerified ?? false,
        verificationStatus: seller?.verificationStatus ?? { emailVerified: true, bioAdded: false, firstBookPublished: false, idVerified: false, tenSalesReached: false },
        taxFormType: seller?.taxFormType ?? null,
        taxFormStatus: seller?.taxFormStatus ?? 'not_submitted',
        pendingBalance: seller?.pendingBalance ?? 0,
        totalEarnings: seller?.totalEarnings ?? 0,
        payoutSchedule: 'monthly',
        followersCount: seller?.followersCount ?? 0,
        totalSales: seller?.totalSales ?? 0,
        averageRating: seller?.averageRating ?? 0,
        createdAt: seller?.createdAt ?? serverTimestamp(),
      }, { merge: true }),
    ]);
    setUserProfile({ ...userProfile, bio: form.bio });
    setSaving(false);
    setSavedProfile(true);
    setSection('preview');
  }

  async function submitIdVerification() {
    if (!userProfile || !idFile) return;
    setIdUploading(true);
    try {
      const storageRef = ref(storage, `verification/${userProfile.uid}/id_${Date.now()}_${idFile.name}`);
      await uploadBytes(storageRef, idFile);
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, 'verificationRequests'), {
        sellerId: userProfile.uid,
        sellerName: `${userProfile.firstName} ${userProfile.lastName}`,
        sellerEmail: userProfile.email,
        fileUrl: url, status: 'pending',
        submittedAt: serverTimestamp(), reviewedAt: null, reviewNote: null,
      });
      setIdRequest({ status: 'pending' });
      setIdFile(null);
    } finally { setIdUploading(false); }
  }

  async function submitTaxForm() {
    if (!userProfile || !taxFile) return;
    setTaxUploading(true);
    try {
      const storageRef = ref(storage, `tax/${userProfile.uid}/${taxFile.name}`);
      await uploadBytes(storageRef, taxFile);
      await setDoc(doc(db, 'sellers', userProfile.uid), { taxFormStatus: 'submitted' }, { merge: true });
      setSeller((s) => s ? { ...s, taxFormStatus: 'submitted' } : s);
      setTaxFile(null);
    } finally { setTaxUploading(false); }
  }

  async function addCoAuthor(bookId: string) {
    const entry = coForm[bookId];
    if (!entry?.name.trim() || !entry?.email.trim() || !entry?.share) return;
    const share = Math.min(100, Math.max(1, parseInt(entry.share)));
    setCoSaving(bookId);
    const book = coBooks.find((b) => b.id === bookId)!;
    const updated = [...(book.coAuthors ?? []), { name: entry.name.trim(), email: entry.email.trim(), revenueShare: share }];
    await updateDoc(doc(db, 'books', bookId), { coAuthors: updated });
    setCoBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, coAuthors: updated } : b));
    setCoForm((prev) => ({ ...prev, [bookId]: { name: '', email: '', share: '' } }));
    setCoSaving(null);
  }

  async function removeCoAuthor(bookId: string, index: number) {
    const book = coBooks.find((b) => b.id === bookId)!;
    const updated = (book.coAuthors ?? []).filter((_, i) => i !== index);
    await updateDoc(doc(db, 'books', bookId), { coAuthors: updated });
    setCoBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, coAuthors: updated } : b));
  }

  async function handlePasswordChange() {
    setPwError(''); setPwSuccess(false);
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }
    if (pwForm.next.length < 8) { setPwError('Min 8 characters.'); return; }
    setPwSaving(true);
    try { await changePassword(pwForm.current, pwForm.next); setPwSuccess(true); setPwForm({ current: '', next: '', confirm: '' }); }
    catch { setPwError('Current password is incorrect.'); }
    finally { setPwSaving(false); }
  }

  async function saveNotifPrefs() {
    if (!userProfile) return;
    setNotifSaving(true);
    await updateUserProfile(userProfile.uid, { notificationPreferences: notifPrefs });
    setNotifSaving(false);
  }

  async function handleStripeConnect() {
    if (!userProfile) return;
    const res = await fetch(`/api/stripe/connect?userId=${userProfile.uid}`);
    const { url } = await res.json();
    if (url) window.location.href = url;
  }

  async function handleSignOut() {
    close();
    await logOut();
    router.replace('/login');
  }

  const verificationSteps = [
    { label: 'Email verified', done: seller?.verificationStatus?.emailVerified ?? false },
    { label: 'Bio added (50+ chars)', done: (userProfile?.bio?.length ?? 0) >= 50 },
    { label: 'First book published', done: seller?.verificationStatus?.firstBookPublished ?? false },
    { label: 'ID verified', done: seller?.verificationStatus?.idVerified ?? false },
    { label: '10 sales reached', done: (seller?.totalSales ?? 0) >= 10 },
  ];
  const verificationDone = verificationSteps.filter((s) => s.done).length;

  const [isMobile, setIsMobile] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  function onTouchStart(e: React.TouchEvent) {
    dragStart.current = e.touches[0].clientY;
    isDragging.current = true;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return;
    const dy = e.touches[0].clientY - dragStart.current;
    if (dy > 0) setDragY(dy);
  }
  function onTouchEnd() {
    isDragging.current = false;
    if (dragY > 100) close();
    setDragY(0);
  }

  const drawerStyle: React.CSSProperties = isMobile ? {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0e0e0e',
    borderTop: '1px solid #1a1a1a',
    borderRadius: '20px 20px 0 0',
    transform: isOpen ? `translateY(${dragY}px)` : 'translateY(100%)',
    transition: isDragging.current ? 'none' : 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
    willChange: 'transform',
  } : {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    width: '100%',
    maxWidth: 500,
    display: 'flex',
    flexDirection: 'column',
    background: '#0e0e0e',
    borderLeft: '1px solid #1a1a1a',
    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
    willChange: 'transform',
  };

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 59,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(3px)',
    opacity: isOpen ? 1 : 0,
    pointerEvents: isOpen ? 'auto' : 'none',
    transition: 'opacity 0.32s ease',
  };

  if (!userProfile) return null;

  return (
    <>
      <div style={backdropStyle} onClick={close} />
      <div style={drawerStyle}
        onTouchStart={isMobile ? onTouchStart : undefined}
        onTouchMove={isMobile ? onTouchMove : undefined}
        onTouchEnd={isMobile ? onTouchEnd : undefined}
      >

        {/* Drag handle — mobile only */}
        {isMobile && (
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: '#333' }} />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #1a1a1a' }}>
          <AvatarUpload size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userProfile.firstName} {userProfile.lastName}</p>
            {seller?.isVerified && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#2e1a0f', color: '#f5b800' }}>Verified Author</span>}
            {!seller?.isVerified && <span className="text-xs text-[#555]">Seller</span>}
          </div>
          <button type="button" onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1a1a] flex-shrink-0"
            style={{ color: '#888' }}>
            <X size={18} />
          </button>
        </div>

        {/* Section nav */}
        <div className="overflow-x-auto px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a1a1a', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          <div className="flex gap-2 w-max">
            {ALL_ITEMS.map((item) => (
              <button key={item.id} type="button"
                onClick={() => { setSection(item.id); if (item.id === 'identity') setSavedProfile(false); }}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                style={{
                  background: section === item.id ? '#f5b800' : '#1a1a1a',
                  color: section === item.id ? '#000' : '#888',
                  border: `1px solid ${section === item.id ? '#f5b800' : '#333'}`,
                }}>
                {item.id === 'identity' && savedProfile ? 'Edit Profile' : item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Switch to buyer */}
          {userProfile.role === 'both' && (
            <button type="button"
              onClick={async () => { await updateUserProfile(userProfile.uid, { activeRole: 'buyer' }); setUserProfile({ ...userProfile, activeRole: 'buyer' }); close(); router.push('/browse'); }}
              className="w-full py-2.5 rounded-xl text-xs font-medium border flex items-center justify-center gap-2"
              style={{ borderColor: '#f5b800', color: '#f5b800' }}>
              Switch to Buyer Mode
            </button>
          )}

          {/* Author Profile */}
          {section === 'identity' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Author Profile</h2>
              <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div>
                  <label className="block text-xs text-[#aaa] mb-1">Pen Name (optional)</label>
                  <input value={form.penName} onChange={(e) => setForm((f) => ({ ...f, penName: e.target.value }))}
                    placeholder="Your writing name" className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <div>
                  <label className="block text-xs text-[#aaa] mb-1">Author Bio</label>
                  <textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    rows={4} placeholder="Tell readers about yourself..."
                    className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
                    style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                  <p className="text-xs mt-1 text-right" style={{ color: form.bio.length >= 50 ? '#4ade80' : '#666' }}>{form.bio.length}/50</p>
                </div>
                <div>
                  <label className="block text-xs text-[#aaa] mb-1">Website</label>
                  <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    placeholder="https://yourwebsite.com" className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <div>
                  <p className="text-xs text-[#aaa] mb-2">Social Links</p>
                  {[
                    { key: 'twitter', label: 'X / Twitter', placeholder: 'twitter.com/handle' },
                    { key: 'instagram', label: 'Instagram', placeholder: 'instagram.com/handle' },
                    { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/handle' },
                    { key: 'goodreads', label: 'Goodreads', placeholder: 'goodreads.com/author/name' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-[#555] w-18 flex-shrink-0 w-20">{label}</span>
                      <input value={form[key as keyof typeof form]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder} className="flex-1 px-3 py-1.5 rounded-lg border text-xs"
                        style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                    </div>
                  ))}
                </div>
                <button type="button" onClick={saveProfile} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#e8442a', color: '#fff' }}>
                  {saving && <LoadingSpinner size={13} color="#fff" />}
                  Save Changes
                </button>
              </div>
            </div>
          )}

          {/* Preview */}
          {section === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-display-sm text-white">Public Page Preview</h2>
                <button type="button"
                  onClick={() => { setSavedProfile(false); setSection('identity'); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                  style={{ borderColor: '#f5b800', color: '#f5b800' }}>
                  Edit Profile
                </button>
              </div>
              {savedProfile && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg" style={{ background: '#0f2e1a', border: '1px solid #1a4a2a' }}>
                  <CheckCircle size={14} style={{ color: '#4ade80' }} />
                  <span className="text-sm" style={{ color: '#4ade80' }}>Profile saved successfully</span>
                </div>
              )}
              {userProfile && (
                <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <span className="text-xs text-[#555] flex-1 truncate">/author/{userProfile.uid.slice(0, 12)}...</span>
                  <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/author/${userProfile.uid}`)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border" style={{ borderColor: '#333', color: '#aaa' }}>
                    <Copy size={11} /> Copy
                  </button>
                  <Link href={`/author/${userProfile.uid}`} onClick={close} target="_blank"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border" style={{ borderColor: '#333', color: '#aaa' }}>
                    <ExternalLink size={11} /> Open
                  </Link>
                </div>
              )}
              <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center text-xl font-bold overflow-hidden"
                    style={{ background: '#1a1a1a', color: '#f5b800', border: '2px solid #2a2a2a' }}>
                    {userProfile.avatarUrl ? <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" /> : (userProfile.firstName?.charAt(0) ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-base text-white">{seller?.penName || `${userProfile.firstName} ${userProfile.lastName}`}</p>
                      {seller?.isVerified && <BadgeCheck size={15} style={{ color: '#f5b800' }} />}
                    </div>
                    {userProfile.bio
                      ? <p className="text-xs text-[#888] mt-1 leading-relaxed">{userProfile.bio}</p>
                      : <p className="text-xs text-[#444] mt-1 italic">No bio yet.</p>}
                    {seller?.website && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-[#555]">
                        <Globe size={11} /> {seller.website}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Verification */}
          {section === 'verification' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Verification</h2>
              <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="p-3 rounded-xl" style={{ background: '#2e1a0f', border: '1px solid #3a2a0a' }}>
                  <p className="text-sm font-medium" style={{ color: '#f5b800' }}>Verified Author Program</p>
                  <p className="text-xs text-[#888] mt-0.5">Complete all steps to earn your verified badge.</p>
                </div>
                <ProgressBar value={verificationDone} max={5} color="#f5b800" height={6} showLabel />
                <div className="space-y-3">
                  {verificationSteps.map(({ label, done }) => (
                    <div key={label}>
                      <div className="flex items-center gap-3">
                        {done ? <CheckCircle size={15} style={{ color: '#4ade80' }} /> : <Circle size={15} style={{ color: '#333' }} />}
                        <span className="text-sm flex-1" style={{ color: done ? '#f5f2eb' : '#555' }}>{label}</span>
                        {!done && label === 'ID verified' && !idRequest && (
                          <button type="button" onClick={() => idInputRef.current?.click()}
                            className="text-xs px-2 py-1 rounded-lg flex items-center gap-1"
                            style={{ background: '#e8442a', color: '#fff' }}>
                            <Upload size={10} /> Upload
                          </button>
                        )}
                        {!done && label === 'ID verified' && idRequest?.status === 'pending' && (
                          <span className="flex items-center gap-1 text-xs" style={{ color: '#f5b800' }}>
                            <Clock size={11} /> Under Review
                          </span>
                        )}
                      </div>
                      {!done && label === 'ID verified' && !idRequest && idFile && (
                        <div className="ml-6 mt-2 p-2 rounded-lg border" style={{ background: '#1a1a1a', borderColor: '#2a2a2a' }}>
                          <p className="text-xs text-[#aaa] mb-2">{idFile.name}</p>
                          <button type="button" onClick={submitIdVerification} disabled={idUploading}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs"
                            style={{ background: '#f5b800', color: '#000' }}>
                            {idUploading ? <LoadingSpinner size={11} color="#000" /> : <Upload size={11} />}
                            Submit
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <input ref={idInputRef} type="file" accept="image/*" className="hidden"
                    aria-label="Upload ID" onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
            </div>
          )}

          {/* Co-Authors */}
          {section === 'coauthor' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Co-Author Settings</h2>
              {coBooksLoading ? <div className="flex justify-center py-10"><LoadingSpinner size={28} /></div>
                : coBooks.length === 0 ? <p className="text-center py-10 text-[#444] text-sm">No live books found.</p>
                : (
                  <div className="space-y-4">
                    {coBooks.map((book) => {
                      const entry = coForm[book.id] ?? { name: '', email: '', share: '' };
                      const totalShare = (book.coAuthors ?? []).reduce((s, c) => s + c.revenueShare, 0);
                      return (
                        <div key={book.id} className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-9 rounded flex-shrink-0" style={{ background: book.coverBgColor }} />
                            <div>
                              <p className="text-xs font-medium text-white">{book.title}</p>
                              <p className="text-xs text-[#555]">Your share: {100 - totalShare}%</p>
                            </div>
                          </div>
                          {(book.coAuthors ?? []).map((ca, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg mb-2" style={{ background: '#1a1a1a' }}>
                              <div>
                                <p className="text-xs font-medium text-white">{ca.name}</p>
                                <p className="text-xs text-[#555]">{ca.email} · {ca.revenueShare}%</p>
                              </div>
                              <button type="button" onClick={() => removeCoAuthor(book.id, i)} className="p-1 rounded hover:bg-[#2a2a2a]">
                                <Trash2 size={12} style={{ color: '#e8442a' }} />
                              </button>
                            </div>
                          ))}
                          <div className="flex gap-2 items-end mt-2">
                            <input value={entry.name} onChange={(e) => setCoForm((f) => ({ ...f, [book.id]: { ...entry, name: e.target.value } }))}
                              placeholder="Name" className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs"
                              style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                            <input value={entry.email} onChange={(e) => setCoForm((f) => ({ ...f, [book.id]: { ...entry, email: e.target.value } }))}
                              placeholder="Email" className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs"
                              style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                            <input value={entry.share} type="number" onChange={(e) => setCoForm((f) => ({ ...f, [book.id]: { ...entry, share: e.target.value } }))}
                              placeholder="%" className="w-12 px-2.5 py-1.5 rounded-lg border text-xs"
                              style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                            <button type="button" onClick={() => addCoAuthor(book.id)} disabled={coSaving === book.id || !entry.name || !entry.email || !entry.share}
                              className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1"
                              style={{ background: '#e8442a', color: '#fff', opacity: (!entry.name || !entry.email || !entry.share) ? 0.4 : 1 }}>
                              {coSaving === book.id ? <LoadingSpinner size={11} color="#fff" /> : <UserPlus size={11} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}

          {/* Payout */}
          {section === 'payout' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Payout Settings</h2>
              <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                {seller?.stripeAccountStatus !== 'active' ? (
                  <>
                    <p className="text-sm text-[#aaa]">Connect your Stripe account to receive payouts.</p>
                    <ul className="space-y-1 text-xs text-[#666]">
                      <li>• Payouts on the 15th of each month</li>
                      <li>• You keep 85% of each sale</li>
                    </ul>
                    <button type="button" onClick={handleStripeConnect}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: '#635bff', color: '#fff' }}>
                      Connect Stripe <ExternalLink size={13} />
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: '#0f2e1a', border: '1px solid #1a4a2a' }}>
                    <CheckCircle size={16} style={{ color: '#4ade80' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#4ade80' }}>Stripe Connected</p>
                      <p className="text-xs text-[#666]">{userProfile.email}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Earnings */}
          {section === 'earnings' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Earnings Summary</h2>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Earned', value: seller?.totalEarnings ?? 0, color: '#4ade80' },
                  { label: 'Pending', value: seller?.pendingBalance ?? 0, color: '#f5b800' },
                  { label: 'Paid Out', value: payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amountCents, 0), color: '#4ade80' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                    <p className="text-xs text-[#555] mb-0.5">{label}</p>
                    <p className="font-display text-lg" style={{ color }}>${(value / 100).toFixed(2)}</p>
                  </div>
                ))}
              </div>
              {payouts.length > 0 && (
                <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <table className="w-full text-xs min-w-[320px]">
                    <thead><tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      {['Period', 'Sales', 'Amount', 'Status'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-[#555] uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {payouts.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #111' }}>
                          <td className="px-3 py-2 text-[#aaa]">{p.periodLabel}</td>
                          <td className="px-3 py-2 text-[#aaa]">{p.salesCount}</td>
                          <td className="px-3 py-2" style={{ color: '#4ade80' }}>${(p.amountCents / 100).toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 rounded capitalize"
                              style={{ background: p.status === 'paid' ? '#0f2e1a' : '#2e1a0f', color: p.status === 'paid' ? '#4ade80' : '#f5b800' }}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tax */}
          {section === 'tax' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Tax Information</h2>
              <p className="text-xs text-[#555]">Required for payouts. US sellers use W-9, international sellers use W-8BEN.</p>
              <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div>
                  <p className="text-xs text-[#aaa] mb-2">Tax Form Type</p>
                  <div className="flex gap-2">
                    {(['W-9', 'W-8BEN'] as const).map((type) => (
                      <button key={type} type="button"
                        onClick={() => setDoc(doc(db, 'sellers', userProfile!.uid), { taxFormType: type }, { merge: true }).then(() => setSeller((s) => s ? { ...s, taxFormType: type } : s))}
                        className="flex-1 py-2.5 rounded-xl border text-xs font-medium"
                        style={{ background: seller?.taxFormType === type ? '#2e1a0f' : '#1a1a1a', borderColor: seller?.taxFormType === type ? '#e8442a' : '#333', color: seller?.taxFormType === type ? '#f5b800' : '#666' }}>
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                {seller?.taxFormStatus === 'submitted' || seller?.taxFormStatus === 'approved' ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: '#0f2e1a' }}>
                    <CheckCircle size={14} style={{ color: '#4ade80' }} />
                    <p className="text-xs" style={{ color: '#4ade80' }}>{seller.taxFormStatus === 'approved' ? 'Form approved' : 'Under review'}</p>
                  </div>
                ) : (
                  <div>
                    <button type="button" onClick={() => taxInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
                      style={{ background: '#1a1a1a', borderColor: '#333', color: '#aaa' }}>
                      <Upload size={12} /> {taxFile ? taxFile.name : 'Choose PDF or image'}
                    </button>
                    <input ref={taxInputRef} type="file" accept="application/pdf,image/*" className="hidden"
                      aria-label="Upload tax form" onChange={(e) => setTaxFile(e.target.files?.[0] ?? null)} />
                    {taxFile && (
                      <button type="button" onClick={submitTaxForm} disabled={taxUploading}
                        className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium"
                        style={{ background: '#e8442a', color: '#fff' }}>
                        {taxUploading && <LoadingSpinner size={12} color="#fff" />}
                        Submit
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Security */}
          {section === 'security' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Password & Security</h2>
              <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="pb-3" style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <p className="text-xs text-[#555] mb-0.5">Email</p>
                  <p className="text-sm text-white">{userProfile.email}</p>
                </div>
                {[
                  { key: 'current', label: 'Current password' },
                  { key: 'next', label: 'New password' },
                  { key: 'confirm', label: 'Confirm' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs text-[#aaa] mb-1">{label}</label>
                    <input type="password" value={pwForm[key as keyof typeof pwForm]}
                      onChange={(e) => setPwForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                  </div>
                ))}
                {pwError && <p className="text-xs text-[#e8442a]">{pwError}</p>}
                {pwSuccess && <p className="text-xs" style={{ color: '#4ade80' }}>Password updated.</p>}
                <button type="button" onClick={handlePasswordChange} disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#e8442a', color: '#fff', opacity: (!pwForm.current || !pwForm.next || !pwForm.confirm) ? 0.5 : 1 }}>
                  {pwSaving && <LoadingSpinner size={13} color="#fff" />}
                  Update Password
                </button>
              </div>
            </div>
          )}

          {/* Notifications */}
          {section === 'notifications' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Notifications</h2>
              <div className="p-5 rounded-xl border space-y-1" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                {([
                  { key: 'purchaseConfirmations', label: 'Purchase confirmations', desc: 'When someone buys your book' },
                  { key: 'reviewReplies', label: 'Review replies', desc: 'When a reader reviews your book' },
                  { key: 'flashSales', label: 'Flash sale alerts', desc: 'Platform promotions' },
                  { key: 'recommendations', label: 'Recommendations', desc: 'Tips to improve your listings' },
                  { key: 'emailReceipts', label: 'Email receipts', desc: 'Payout and transaction emails' },
                  { key: 'weeklyDigest', label: 'Weekly digest', desc: 'Weekly performance summary' },
                  { key: 'promotionalEmails', label: 'Promotional emails', desc: 'AfroBooks news' },
                ] as { key: keyof typeof notifPrefs; label: string; desc: string }[]).map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <div>
                      <p className="text-sm text-white">{label}</p>
                      <p className="text-xs text-[#555]">{desc}</p>
                    </div>
                    <button type="button" title={`Toggle ${label}`}
                      onClick={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))}
                      className="relative rounded-full flex-shrink-0 transition-colors"
                      style={{ background: notifPrefs[key] ? '#e8442a' : '#333', height: 22, width: 40 }}>
                      <span className="absolute top-0.5 rounded-full bg-white transition-all"
                        style={{ left: notifPrefs[key] ? 18 : 2, width: 18, height: 18 }} />
                    </button>
                  </div>
                ))}
                <div className="pt-3">
                  <button type="button" onClick={saveNotifPrefs} disabled={notifSaving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: '#e8442a', color: '#fff' }}>
                    {notifSaving && <LoadingSpinner size={13} color="#fff" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid #1a1a1a' }}>
          <button type="button" onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm hover:bg-[#1a1a1a] transition-colors"
            style={{ color: '#666' }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    </>
  );
}
