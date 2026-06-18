'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ExternalLink, CheckCircle, Circle, Upload, Clock, Plus, Trash2, UserPlus, Copy, BadgeCheck, Globe } from 'lucide-react';
import SellerHeader from '@/components/seller/SellerHeader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import AvatarUpload from '@/components/shared/AvatarUpload';
import { useAuthStore } from '@/store/authStore';
import { getSellerPublishedBooksCount } from '@/lib/firebase/firestore';
import { db, storage } from '@/lib/firebase/config';
import { doc, getDoc, setDoc, addDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateUserProfile, changePassword, logOut } from '@/lib/firebase/auth';
import {
  DEFAULT_SELLER_VERIFICATION_STATUS,
  SELLER_BOOKS_BEFORE_ID_VERIFICATION,
  canSubmitSellerIdVerification,
  getRemainingGraceBooksBeforeIdVerification,
  hasCompletedSellerVerification,
} from '@/lib/sellerVerification';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Seller } from '@/types/user';
import type { Book } from '@/types/book';
import ProgressBar from '@/components/shared/ProgressBar';

const SIDEBAR_GROUPS = [
  { label: 'Identity', items: [
    { id: 'identity', label: 'Author Profile' },
    { id: 'preview', label: 'Public Page Preview' },
    { id: 'verification', label: 'Verification' },
  ]},
  { label: 'Publishing', items: [
    { id: 'ebooks', label: 'My Ebooks' },
    { id: 'coauthor', label: 'Co-Author Settings' },
  ]},
  { label: 'Money', items: [
    { id: 'payout', label: 'Payout Settings' },
    { id: 'tax', label: 'Tax Information' },
    { id: 'earnings', label: 'Earnings Summary' },
  ]},
  { label: 'Account', items: [
    { id: 'security', label: 'Password & Security' },
    { id: 'notifications', label: 'Notifications' },
  ]},
];

function SellerProfilePageFallback() {
  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />
      <div className="flex justify-center pt-16"><LoadingSpinner size={32} /></div>
    </div>
  );
}

function SellerProfilePageContent() {
  const { section } = useParams<{ section: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stripeConnected = searchParams.get('connected') === '1';
  const stripeReauth = searchParams.get('reauth') === '1';
  const { userProfile, firebaseUser, setUserProfile, loading: authLoading } = useAuthStore();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishedBooksCount, setPublishedBooksCount] = useState(0);
  const [form, setForm] = useState({
    penName: '', website: '', bio: '',
    twitter: '', instagram: '', linkedin: '', goodreads: '',
  });
  const [saving, setSaving] = useState(false);
  const [idRequest, setIdRequest] = useState<{ status: string; submittedAt?: unknown } | null>(null);
  const [idUploading, setIdUploading] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const idInputRef = useRef<HTMLInputElement>(null);
  // Co-author
  const [coBooks, setCoBooks] = useState<Book[]>([]);
  const [coBooksLoading, setCoBooksLoading] = useState(false);
  const [coForm, setCoForm] = useState<Record<string, { name: string; email: string; share: string }>>({});
  const [coSaving, setCoSaving] = useState<string | null>(null);
  // Earnings
  const [payouts, setPayouts] = useState<{ id: string; periodLabel: string; salesCount: number; amountCents: number; status: string }[]>([]);
  // Tax
  const [taxFile, setTaxFile] = useState<File | null>(null);
  const [taxUploading, setTaxUploading] = useState(false);
  const taxInputRef = useRef<HTMLInputElement>(null);
  // Security
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [authorProfileUrl, setAuthorProfileUrl] = useState('');
  // Notifications
  const [notifPrefs, setNotifPrefs] = useState(userProfile?.notificationPreferences ?? {
    purchaseConfirmations: true, readingReminders: true, newChapterAlerts: true,
    reviewReplies: true, flashSales: true, recommendations: true,
    emailReceipts: true, weeklyDigest: false, promotionalEmails: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) { setLoading(false); return; }
    let active = true;
    Promise.all([
      getDoc(doc(db, 'sellers', userProfile.uid)),
      getDocs(query(collection(db, 'verificationRequests'), where('sellerId', '==', userProfile.uid), orderBy('submittedAt', 'desc'), limit(1))),
      getSellerPublishedBooksCount(userProfile.uid),
    ]).then(([sellerSnap, requestSnap, bookCount]) => {
      if (!active) return;
      if (sellerSnap.exists()) {
        const s = sellerSnap.data() as Seller;
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
      if (!requestSnap.empty) setIdRequest(requestSnap.docs[0].data() as { status: string });
      setPublishedBooksCount(bookCount);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [authLoading, userProfile?.uid]);

  useEffect(() => {
    if (typeof window !== 'undefined' && userProfile?.uid) {
      setAuthorProfileUrl(`${window.location.origin}/author/${userProfile.uid}`);
    }
  }, [userProfile?.uid]);

  useEffect(() => {
    if (section !== 'coauthor' || !userProfile) return;
    setCoBooksLoading(true);
    getDocs(query(collection(db, 'books'), where('sellerId', '==', userProfile.uid), where('status', '==', 'live')))
      .then((snap) => {
        setCoBooks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Book)));
        setCoBooksLoading(false);
      });
  }, [section, userProfile?.uid]);

  async function addCoAuthor(bookId: string) {
    const entry = coForm[bookId];
    if (!entry?.name.trim() || !entry?.email.trim() || !entry?.share) return;
    const share = Math.min(100, Math.max(1, parseInt(entry.share)));
    setCoSaving(bookId);
    const book = coBooks.find((b) => b.id === bookId)!;
    const existing = book.coAuthors ?? [];
    const updated = [...existing, { name: entry.name.trim(), email: entry.email.trim(), revenueShare: share }];
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

  useEffect(() => {
    if (section !== 'earnings' || !userProfile) return;
    getDocs(query(collection(db, 'payouts'), where('sellerId', '==', userProfile.uid))).then((snap) => {
      setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)));
    });
  }, [section, userProfile?.uid]);

  async function submitTaxForm() {
    if (!userProfile || !taxFile) return;
    setTaxUploading(true);
    try {
      const storageRef = ref(storage, `tax/${userProfile.uid}/${taxFile.name}`);
      await uploadBytes(storageRef, taxFile);
      await setDoc(doc(db, 'sellers', userProfile.uid), {
        taxFormStatus: 'submitted',
      }, { merge: true });
      setSeller((s) => s ? { ...s, taxFormStatus: 'submitted' } : s);
      setTaxFile(null);
    } finally {
      setTaxUploading(false);
    }
  }

  async function handlePasswordChange() {
    setPwError('');
    setPwSuccess(false);
    if (pwForm.next !== pwForm.confirm) { setPwError('New passwords do not match.'); return; }
    if (pwForm.next.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    setPwSaving(true);
    try {
      await changePassword(pwForm.current, pwForm.next);
      setPwSuccess(true);
      setPwForm({ current: '', next: '', confirm: '' });
    } catch {
      setPwError('Current password is incorrect.');
    } finally {
      setPwSaving(false);
    }
  }

  async function saveNotifPrefs() {
    if (!userProfile) return;
    setNotifSaving(true);
    await updateUserProfile(userProfile.uid, { notificationPreferences: notifPrefs });
    setNotifSaving(false);
  }

  async function handleStripeConnect() {
    if (!userProfile || !firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    const res = await fetch('/api/stripe/connect', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
  }

  async function saveProfile() {
    if (!userProfile) return;
    const bioAdded = form.bio.trim().length >= 50;
    const nextVerificationStatus = {
      ...DEFAULT_SELLER_VERIFICATION_STATUS,
      ...(seller?.verificationStatus ?? {}),
      emailVerified: seller?.verificationStatus?.emailVerified ?? true,
      bioAdded,
      tenSalesReached: (seller?.totalSales ?? 0) >= 10,
    };
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
        isVerified: hasCompletedSellerVerification(nextVerificationStatus),
        verificationStatus: nextVerificationStatus,
        taxFormType: seller?.taxFormType ?? null,
        taxFormStatus: seller?.taxFormStatus ?? 'not_submitted',
        pendingBalance: seller?.pendingBalance ?? 0,
        totalEarnings: seller?.totalEarnings ?? 0,
        payoutSchedule: 'monthly',
        nextPayoutDate: seller?.nextPayoutDate ?? serverTimestamp(),
        followersCount: seller?.followersCount ?? 0,
        totalSales: seller?.totalSales ?? 0,
        averageRating: seller?.averageRating ?? 0,
        createdAt: seller?.createdAt ?? serverTimestamp(),
      }, { merge: true }),
    ]);
    setUserProfile({ ...userProfile, bio: form.bio });
    setSaving(false);
  }

  async function submitIdVerification() {
    if (!userProfile || !idFile || !canUploadIdVerification) return;
    setIdUploading(true);
    try {
      const storageRef = ref(storage, `verification/${userProfile.uid}/id_${Date.now()}_${idFile.name}`);
      await uploadBytes(storageRef, idFile);
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, 'verificationRequests'), {
        sellerId: userProfile.uid,
        sellerName: `${userProfile.firstName} ${userProfile.lastName}`,
        sellerEmail: userProfile.email,
        fileUrl: url,
        status: 'pending',
        submittedAt: serverTimestamp(),
        reviewedAt: null,
        reviewNote: null,
      });
      setIdRequest({ status: 'pending' });
      setIdFile(null);
    } finally {
      setIdUploading(false);
    }
  }

  const verificationSteps = [
    { label: 'Email verified', done: seller?.verificationStatus?.emailVerified ?? false },
    { label: 'Bio added (50+ chars)', done: (userProfile?.bio?.length ?? 0) >= 50 },
    { label: 'First book published', done: seller?.verificationStatus?.firstBookPublished ?? false },
    { label: 'ID verified', done: seller?.verificationStatus?.idVerified ?? false },
    { label: '10 sales reached', done: (seller?.totalSales ?? 0) >= 10 },
  ];
  const verificationDone = verificationSteps.filter((s) => s.done).length;
  const booksRemainingBeforeVerification = getRemainingGraceBooksBeforeIdVerification(publishedBooksCount);
  const canUploadIdVerification = canSubmitSellerIdVerification(publishedBooksCount);
  const sellerDisplayName = seller?.penName || `${userProfile?.firstName} ${userProfile?.lastName}`;

  if (loading) return (
    <div className="min-h-screen bg-[#0e0e0e]"><SellerHeader />
      <div className="flex justify-center pt-16"><LoadingSpinner size={32} /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />

      {/* Mobile section picker */}
      <div className="sm:hidden overflow-x-auto px-4 pt-4 pb-1" style={{ borderBottom: '1px solid #1a1a1a' }}>
        <div className="flex gap-2 w-max">
          {SIDEBAR_GROUPS.flatMap((g) => g.items).map((item) => (
            <Link
              key={item.id}
              href={`/seller/profile/${item.id}`}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
              style={{
                background: section === item.id ? '#f5b800' : '#1a1a1a',
                color: section === item.id ? '#000' : '#888',
                border: `1px solid ${section === item.id ? '#f5b800' : '#333'}`,
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8 sm:flex sm:gap-7">
        {/* Sidebar — desktop only */}
        <aside className="hidden sm:block w-52 flex-shrink-0">
          <div className="p-4 rounded-xl border mb-4 text-center flex flex-col items-center" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <AvatarUpload size={48} />
            <p className="text-sm font-medium text-white mt-2">{userProfile?.firstName} {userProfile?.lastName}</p>
            {seller?.isVerified && <span className="text-xs px-2 py-0.5 rounded mt-1 inline-block" style={{ background: '#2e1a0f', color: '#f5b800' }}>Verified Author</span>}
          </div>
          <nav className="space-y-4">
            {SIDEBAR_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs text-[#444] uppercase tracking-wider px-3 mb-1">{group.label}</p>
                {group.items.map((item) => (
                  <Link key={item.id} href={`/seller/profile/${item.id}`}
                    className="block px-3 py-2 rounded-lg text-sm transition-colors"
                    style={{ background: section === item.id ? '#2e1a0f' : 'transparent', color: section === item.id ? '#f5b800' : '#888' }}>
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Mobile-only action buttons */}
          <div className="sm:hidden flex gap-3">
            {userProfile?.role === 'both' && (
              <button type="button"
                onClick={async () => {
                  await updateUserProfile(userProfile.uid, { activeRole: 'buyer' });
                  router.push('/browse');
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium border"
                style={{ borderColor: '#f5b800', color: '#f5b800' }}>
                Switch to Reader
              </button>
            )}
            <button type="button"
              onClick={async () => { await logOut(); router.replace('/login'); }}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium border"
              style={{ borderColor: '#333', color: '#888' }}>
              Sign out
            </button>
          </div>

          <div
            className="p-5 sm:p-6 rounded-2xl border space-y-5"
            style={{
              background: 'linear-gradient(135deg, rgba(245,184,0,0.14) 0%, rgba(17,17,17,0.96) 42%, rgba(232,68,42,0.14) 100%)',
              borderColor: '#2a2111',
            }}
          >
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div className="flex items-start gap-4">
                <div
                  className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-lg font-bold flex-shrink-0"
                  style={{ background: '#141414', color: '#f5b800', border: '1px solid #2a2a2a' }}
                >
                  {userProfile?.avatarUrl
                    ? <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : (userProfile?.firstName?.[0] ?? '?')}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-display-sm text-white">{sellerDisplayName}</h1>
                    {seller?.isVerified ? (
                      <span className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{ background: '#2e1a0f', color: '#f5b800' }}>
                        <BadgeCheck size={12} /> Verified Author
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#1a1a2e', color: '#93c5fd' }}>
                        Author Profile
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#94a3b8]">
                    {userProfile?.username ? `@${userProfile.username}` : 'Add a handle so readers can recognize you'}
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: userProfile?.bio ? '#d1d5db' : '#6b7280' }}>
                    {userProfile?.bio || 'Add a stronger author bio to build trust with readers and unlock verification faster.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  href="/publish"
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-center"
                  style={{ background: '#e8442a', color: '#fff' }}
                >
                  Publish New Book
                </Link>
                <Link
                  href="/seller/profile/verification"
                  className="px-4 py-2.5 rounded-xl text-sm font-medium border text-center"
                  style={{ borderColor: '#f5b800', color: '#f5b800' }}
                >
                  Verification
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: 'Published Books', value: publishedBooksCount.toString(), hint: 'Live, review, and pre-orders' },
                { label: 'Total Sales', value: (seller?.totalSales ?? 0).toString(), hint: 'Marketplace orders' },
                { label: 'Verification', value: `${verificationDone}/5`, hint: 'Author trust progress' },
                { label: 'Total Earnings', value: centsToDisplay(seller?.totalEarnings ?? 0), hint: 'Gross author earnings' },
              ].map(({ label, value, hint }) => (
                <div key={label} className="p-3 rounded-xl border" style={{ background: 'rgba(17,17,17,0.88)', borderColor: '#2a2111' }}>
                  <p className="text-xs text-[#6b7280]">{label}</p>
                  <p className="font-display text-xl text-white mt-1">{value}</p>
                  <p className="text-xs text-[#4b5563] mt-1">{hint}</p>
                </div>
              ))}
            </div>

            <ProgressBar value={verificationDone} max={5} color="#f5b800" height={6} showLabel />
          </div>

          {section === 'identity' && (
            <div>
              <h1 className="font-display text-display-sm text-white mb-5">Author Profile</h1>
              <div className="p-6 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">Pen Name (optional)</label>
                  <input value={form.penName} onChange={(e) => setForm((f) => ({ ...f, penName: e.target.value }))}
                    placeholder="Your writing name" className="w-full px-3.5 py-2.5 rounded-lg border text-sm"
                    style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">Author Bio</label>
                  <textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    rows={4} placeholder="Tell readers about yourself (min 50 chars for verification)..."
                    className="w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none"
                    style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                  <p className="text-xs mt-1 text-right" style={{ color: form.bio.length >= 50 ? '#4ade80' : '#666' }}>{form.bio.length}/50</p>
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">Website</label>
                  <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    placeholder="https://yourwebsite.com" className="w-full px-3.5 py-2.5 rounded-lg border text-sm"
                    style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <div>
                  <p className="text-sm text-[#aaa] mb-2">Social Links</p>
                  <div className="space-y-2">
                    {[
                      { key: 'twitter', placeholder: 'https://twitter.com/yourhandle', label: 'X / Twitter' },
                      { key: 'instagram', placeholder: 'https://instagram.com/yourhandle', label: 'Instagram' },
                      { key: 'linkedin', placeholder: 'https://linkedin.com/in/yourhandle', label: 'LinkedIn' },
                      { key: 'goodreads', placeholder: 'https://goodreads.com/author/yourname', label: 'Goodreads' },
                    ].map(({ key, placeholder, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs text-[#555] w-20 flex-shrink-0">{label}</span>
                        <input
                          value={form[key as keyof typeof form]}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="flex-1 px-3 py-2 rounded-lg border text-xs"
                          style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={saveProfile} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: '#e8442a', color: '#fff' }}>
                  {saving && <LoadingSpinner size={14} color="#fff" />}
                  Save Changes
                </button>
              </div>
            </div>
          )}

          {section === 'verification' && (
            <div>
              <h1 className="font-display text-display-sm text-white mb-5">Verification</h1>
              <div className="p-6 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="p-4 rounded-xl" style={{ background: '#2e1a0f', border: '1px solid #3a2a0a' }}>
                  <p className="text-sm font-medium" style={{ color: '#f5b800' }}>Verified Author Program</p>
                  <p className="text-xs text-[#888] mt-1">
                    Publish your first {SELLER_BOOKS_BEFORE_ID_VERIFICATION} books before we ask for ID verification. The verified badge still requires all steps below.
                  </p>
                </div>
                {!seller?.verificationStatus?.idVerified && (
                  <div className="p-4 rounded-xl border flex items-center justify-between gap-3" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#dbeafe' }}>
                        {canUploadIdVerification
                          ? 'ID verification unlocked'
                          : `Publish ${booksRemainingBeforeVerification} more ${booksRemainingBeforeVerification === 1 ? 'book' : 'books'} first`}
                      </p>
                      <p className="text-xs text-[#94a3b8] mt-1">
                        {canUploadIdVerification
                          ? 'You have published enough books. Submit your government-issued ID to keep publishing new titles.'
                          : `You currently have ${publishedBooksCount} published ${publishedBooksCount === 1 ? 'book' : 'books'}.`}
                      </p>
                    </div>
                    {!canUploadIdVerification && (
                      <Link
                        href="/publish"
                        className="px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap"
                        style={{ background: '#e8442a', color: '#fff' }}
                      >
                        Publish
                      </Link>
                    )}
                  </div>
                )}
                <ProgressBar value={verificationDone} max={5} color="#f5b800" height={6} showLabel />
                <div className="space-y-3">
                  {verificationSteps.map(({ label, done }) => (
                    <div key={label} className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        {done ? <CheckCircle size={16} style={{ color: '#4ade80' }} /> : <Circle size={16} style={{ color: '#333' }} />}
                        <span className="text-sm" style={{ color: done ? '#f5f2eb' : '#555' }}>{label}</span>
                        {!done && label === 'ID verified' && !canUploadIdVerification && (
                          <span className="ml-auto text-xs" style={{ color: '#666' }}>
                            Unlock after {booksRemainingBeforeVerification} more {booksRemainingBeforeVerification === 1 ? 'book' : 'books'}
                          </span>
                        )}
                        {!done && label === 'ID verified' && canUploadIdVerification && !idRequest && (
                          <button type="button" onClick={() => idInputRef.current?.click()}
                            className="ml-auto text-xs px-2.5 py-1 rounded-lg flex items-center gap-1"
                            style={{ background: '#e8442a', color: '#fff' }}>
                            <Upload size={10} /> Upload ID
                          </button>
                        )}
                        {!done && label === 'ID verified' && canUploadIdVerification && idRequest?.status === 'pending' && (
                          <span className="ml-auto flex items-center gap-1 text-xs" style={{ color: '#f5b800' }}>
                            <Clock size={12} /> Under review
                          </span>
                        )}
                        {!done && label === 'ID verified' && canUploadIdVerification && idRequest?.status === 'rejected' && (
                          <button type="button" onClick={() => idInputRef.current?.click()}
                            className="ml-auto text-xs px-2.5 py-1 rounded-lg"
                            style={{ background: '#e8442a', color: '#fff' }}>
                            Resubmit ID
                          </button>
                        )}
                      </div>
                      {!done && label === 'ID verified' && canUploadIdVerification && !idRequest && idFile && (
                        <div className="ml-7 p-3 rounded-lg border space-y-2" style={{ background: '#1a1a1a', borderColor: '#2a2a2a' }}>
                          <p className="text-xs text-[#aaa]">Selected: <span className="text-white">{idFile.name}</span></p>
                          <button type="button" onClick={submitIdVerification} disabled={idUploading}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium"
                            style={{ background: '#f5b800', color: '#000' }}>
                            {idUploading ? <LoadingSpinner size={12} color="#000" /> : <Upload size={12} />}
                            Submit for Review
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <input ref={idInputRef} type="file" accept="image/*" className="hidden"
                    aria-label="Upload government ID document"
                    onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
            </div>
          )}

          {section === 'payout' && (
            <div>
              <h1 className="font-display text-display-sm text-white mb-5">Payout Settings</h1>

              {stripeConnected && (
                <div className="flex items-center gap-3 p-4 rounded-xl mb-4" style={{ background: '#0f2e1a', border: '1px solid #1a4a2a' }}>
                  <CheckCircle size={16} style={{ color: '#4ade80' }} />
                  <p className="text-sm" style={{ color: '#4ade80' }}>Stripe account connected successfully! You can now receive payouts.</p>
                </div>
              )}
              {stripeReauth && (
                <div className="flex items-center gap-3 p-4 rounded-xl mb-4" style={{ background: '#2e1a0f', border: '1px solid #3a2a0a' }}>
                  <ExternalLink size={16} style={{ color: '#f5b800' }} />
                  <p className="text-sm" style={{ color: '#f5b800' }}>Your Stripe session expired. Please reconnect your account.</p>
                </div>
              )}

              {seller?.stripeAccountStatus !== 'active' ? (
                <div className="p-6 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <p className="text-sm text-[#aaa]">Connect your Stripe account to receive payouts.</p>
                  <ul className="space-y-1.5 text-xs text-[#666]">
                    <li>• Payouts processed automatically on the 15th of each month</li>
                    <li>• You keep 85% of each sale (AfroBooks takes 15%)</li>
                    <li>• Subscription borrows earn per-read credits</li>
                  </ul>
                  <button type="button" onClick={handleStripeConnect}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium"
                    style={{ background: '#635bff', color: '#fff' }}>
                    Connect Stripe Account <ExternalLink size={14} />
                  </button>
                </div>
              ) : (
                <div className="p-6 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: '#0f2e1a', border: '1px solid #1a4a2a' }}>
                    <CheckCircle size={18} style={{ color: '#4ade80' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#4ade80' }}>Stripe Connected</p>
                      <p className="text-xs text-[#666]">{userProfile?.email}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {section === 'preview' && (
            <div>
              <h1 className="font-display text-display-sm text-white mb-2">Public Page Preview</h1>
              <p className="text-sm text-[#555] mb-5">This is how readers see your author profile.</p>

              {/* Share link */}
              {userProfile && (
                <div className="flex items-center gap-2 mb-5 p-3 rounded-lg border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <span className="text-xs text-[#555] flex-1 truncate">
                    {authorProfileUrl || `/author/${userProfile.uid}`}
                  </span>
                  <button type="button" title="Copy link"
                    onClick={() => authorProfileUrl && navigator.clipboard.writeText(authorProfileUrl)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border flex-shrink-0"
                    style={{ borderColor: '#333', color: '#aaa' }}>
                    <Copy size={12} /> Copy link
                  </button>
                  <Link href={`/author/${userProfile.uid}`} target="_blank"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border flex-shrink-0"
                    style={{ borderColor: '#333', color: '#aaa' }}>
                    <ExternalLink size={12} /> Open
                  </Link>
                </div>
              )}

              {/* Preview card */}
              <div className="p-6 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center text-xl font-bold overflow-hidden"
                    style={{ background: '#1a1a1a', color: '#f5b800', border: '2px solid #2a2a2a' }}>
                    {userProfile?.avatarUrl
                      ? <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                      : (userProfile?.firstName?.charAt(0) ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-lg text-white">
                        {seller?.penName || `${userProfile?.firstName} ${userProfile?.lastName}`}
                      </p>
                      {seller?.isVerified && <BadgeCheck size={16} style={{ color: '#f5b800' }} />}
                    </div>
                    <p className="text-xs text-[#555] mt-0.5">{coBooks.length} books published</p>
                    {userProfile?.bio
                      ? <p className="text-sm text-[#888] mt-2 leading-relaxed">{userProfile.bio}</p>
                      : <p className="text-xs text-[#444] mt-2 italic">No bio added yet — update your Author Profile.</p>}
                    {seller?.website && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-[#555]">
                        <Globe size={12} /> {seller.website}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#444] mt-4 text-center">
                Update your bio, social links, and avatar in <Link href="/seller/profile/identity" className="underline" style={{ color: '#f5b800' }}>Author Profile</Link>.
              </p>
            </div>
          )}

          {section === 'coauthor' && (
            <div>
              <h1 className="font-display text-display-sm text-white mb-2">Co-Author Settings</h1>
              <p className="text-sm text-[#555] mb-5">Add co-authors to your books and set their revenue share.</p>
              {coBooksLoading ? (
                <div className="flex justify-center py-12"><LoadingSpinner size={28} /></div>
              ) : coBooks.length === 0 ? (
                <div className="text-center py-12 text-[#444] text-sm">No live books found. Publish a book first.</div>
              ) : (
                <div className="space-y-4">
                  {coBooks.map((book) => {
                    const entry = coForm[book.id] ?? { name: '', email: '', share: '' };
                    const totalShare = (book.coAuthors ?? []).reduce((s, c) => s + c.revenueShare, 0);
                    return (
                      <div key={book.id} className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-10 rounded flex-shrink-0" style={{ background: book.coverBgColor }} />
                          <div>
                            <p className="text-sm font-medium text-white">{book.title}</p>
                            <p className="text-xs text-[#555]">Your share: {100 - totalShare}% · Co-author share: {totalShare}%</p>
                          </div>
                        </div>

                        {(book.coAuthors ?? []).length > 0 && (
                          <div className="mb-4 space-y-2">
                            {(book.coAuthors ?? []).map((ca, i) => (
                              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#1a1a1a' }}>
                                <div>
                                  <p className="text-xs font-medium text-white">{ca.name}</p>
                                  <p className="text-xs text-[#555]">{ca.email} · {ca.revenueShare}% revenue share</p>
                                </div>
                                <button type="button" title="Remove co-author" onClick={() => removeCoAuthor(book.id, i)}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-[#2a2a2a]">
                                  <Trash2 size={13} style={{ color: '#e8442a' }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <p className="text-xs text-[#555] mb-1">Name</p>
                            <input value={entry.name}
                              onChange={(e) => setCoForm((f) => ({ ...f, [book.id]: { ...entry, name: e.target.value } }))}
                              placeholder="Co-author name" className="w-full px-3 py-2 rounded-lg border text-xs"
                              style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-[#555] mb-1">Email</p>
                            <input value={entry.email}
                              onChange={(e) => setCoForm((f) => ({ ...f, [book.id]: { ...entry, email: e.target.value } }))}
                              placeholder="their@email.com" className="w-full px-3 py-2 rounded-lg border text-xs"
                              style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                          </div>
                          <div className="w-20">
                            <p className="text-xs text-[#555] mb-1">Share %</p>
                            <input value={entry.share} type="number" min={1} max={99}
                              onChange={(e) => setCoForm((f) => ({ ...f, [book.id]: { ...entry, share: e.target.value } }))}
                              placeholder="30" className="w-full px-3 py-2 rounded-lg border text-xs"
                              style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                          </div>
                          <button type="button" onClick={() => addCoAuthor(book.id)}
                            disabled={coSaving === book.id || !entry.name || !entry.email || !entry.share}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0"
                            style={{ background: '#e8442a', color: '#fff', opacity: (!entry.name || !entry.email || !entry.share) ? 0.4 : 1 }}>
                            {coSaving === book.id ? <LoadingSpinner size={12} color="#fff" /> : <UserPlus size={12} />}
                            Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {section === 'earnings' && (
            <div>
              <h1 className="font-display text-display-sm text-white mb-5">Earnings Summary</h1>
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: 'Total Earned', value: seller?.totalEarnings ?? 0, color: '#4ade80' },
                  { label: 'Pending Balance', value: seller?.pendingBalance ?? 0, color: '#f5b800' },
                  { label: 'Paid Out', value: payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amountCents, 0), color: '#4ade80' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                    <p className="text-xs text-[#555] mb-1">{label}</p>
                    <p className="font-display text-2xl" style={{ color }}>${(value / 100).toFixed(2)}</p>
                  </div>
                ))}
              </div>
              {payouts.length === 0 ? (
                <p className="text-center py-12 text-[#444] text-sm">No payouts yet.</p>
              ) : (
                <div className="rounded-xl border overflow-hidden" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <table className="w-full text-sm">
                    <thead><tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      {['Period', 'Sales', 'Amount', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {payouts.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #111' }}>
                          <td className="px-4 py-3 text-[#aaa]">{p.periodLabel}</td>
                          <td className="px-4 py-3 text-[#aaa]">{p.salesCount}</td>
                          <td className="px-4 py-3" style={{ color: '#4ade80' }}>${(p.amountCents / 100).toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded capitalize"
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

          {section === 'tax' && (
            <div>
              <h1 className="font-display text-display-sm text-white mb-2">Tax Information</h1>
              <p className="text-sm text-[#555] mb-5">Required for payouts. US authors use W-9, international authors use W-8BEN.</p>
              <div className="p-6 rounded-xl border space-y-5" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div>
                  <p className="text-sm text-[#aaa] mb-2">Tax Form Type</p>
                  <div className="flex gap-3">
                    {(['W-9', 'W-8BEN'] as const).map((type) => (
                      <button key={type} type="button"
                        onClick={() => setDoc(doc(db, 'sellers', userProfile!.uid), { taxFormType: type }, { merge: true }).then(() => setSeller((s) => s ? { ...s, taxFormType: type } : s))}
                        className="flex-1 py-3 rounded-xl border text-sm font-medium transition-colors"
                        style={{
                          background: seller?.taxFormType === type ? '#2e1a0f' : '#1a1a1a',
                          borderColor: seller?.taxFormType === type ? '#e8442a' : '#333',
                          color: seller?.taxFormType === type ? '#f5b800' : '#666',
                        }}>
                        {type}
                        <span className="block text-xs font-normal mt-0.5" style={{ color: '#555' }}>
                          {type === 'W-9' ? 'US citizens / residents' : 'Non-US individuals'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-[#aaa] mb-2">Upload Completed Form</p>
                  {seller?.taxFormStatus === 'submitted' || seller?.taxFormStatus === 'approved' ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#0f2e1a' }}>
                      <CheckCircle size={16} style={{ color: '#4ade80' }} />
                      <p className="text-sm" style={{ color: '#4ade80' }}>
                        {seller.taxFormStatus === 'approved' ? 'Tax form approved' : 'Tax form submitted — under review'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={() => taxInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm"
                        style={{ background: '#1a1a1a', borderColor: '#333', color: '#aaa' }}>
                        <Upload size={14} />
                        {taxFile ? taxFile.name : 'Choose PDF or image'}
                      </button>
                      <input ref={taxInputRef} type="file" accept="application/pdf,image/*" className="hidden"
                        aria-label="Upload tax form" onChange={(e) => setTaxFile(e.target.files?.[0] ?? null)} />
                      {taxFile && (
                        <button type="button" onClick={submitTaxForm} disabled={taxUploading}
                          className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
                          style={{ background: '#e8442a', color: '#fff' }}>
                          {taxUploading && <LoadingSpinner size={14} color="#fff" />}
                          Submit Form
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {section === 'security' && (
            <div>
              <h1 className="font-display text-display-sm text-white mb-5">Password & Security</h1>
              <div className="p-6 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="pb-4" style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <p className="text-xs text-[#555] mb-0.5">Email</p>
                  <p className="text-sm text-white">{userProfile?.email}</p>
                </div>
                <p className="text-sm font-medium text-white">Change Password</p>
                {[
                  { key: 'current', label: 'Current password', placeholder: '••••••••' },
                  { key: 'next', label: 'New password', placeholder: 'Min 8 characters' },
                  { key: 'confirm', label: 'Confirm new password', placeholder: '••••••••' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm text-[#aaa] mb-1.5">{label}</label>
                    <input type="password" value={pwForm[key as keyof typeof pwForm]}
                      onChange={(e) => setPwForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder} className="w-full px-3.5 py-2.5 rounded-lg border text-sm"
                      style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                  </div>
                ))}
                {pwError && <p className="text-sm text-[#e8442a]">{pwError}</p>}
                {pwSuccess && <p className="text-sm text-[#4ade80]">Password updated successfully.</p>}
                <button type="button" onClick={handlePasswordChange} disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: '#e8442a', color: '#fff', opacity: (!pwForm.current || !pwForm.next || !pwForm.confirm) ? 0.5 : 1 }}>
                  {pwSaving && <LoadingSpinner size={14} color="#fff" />}
                  Update Password
                </button>
              </div>
            </div>
          )}

          {section === 'notifications' && (
            <div>
              <h1 className="font-display text-display-sm text-white mb-5">Notifications</h1>
              <div className="p-6 rounded-xl border space-y-1" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                {([
                  { key: 'purchaseConfirmations', label: 'Purchase confirmations', desc: 'When someone buys your book' },
                  { key: 'reviewReplies', label: 'Review replies', desc: 'When a reader reviews your book' },
                  { key: 'newChapterAlerts', label: 'New chapter alerts', desc: 'Alerts about your own chapter updates' },
                  { key: 'flashSales', label: 'Flash sale alerts', desc: 'Platform-wide promotions and events' },
                  { key: 'recommendations', label: 'Recommendations', desc: 'Tips to improve your listings' },
                  { key: 'emailReceipts', label: 'Email receipts', desc: 'Payout and transaction emails' },
                  { key: 'weeklyDigest', label: 'Weekly digest', desc: 'Weekly summary of your performance' },
                  { key: 'promotionalEmails', label: 'Promotional emails', desc: 'AfroBooks news and updates' },
                ] as { key: keyof typeof notifPrefs; label: string; desc: string }[]).map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <div>
                      <p className="text-sm text-white">{label}</p>
                      <p className="text-xs text-[#555]">{desc}</p>
                    </div>
                    <button type="button"
                      title={`Toggle ${label}`}
                      onClick={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))}
                      className="relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0"
                      style={{ background: notifPrefs[key] ? '#e8442a' : '#333', height: '22px', width: '40px' }}>
                      <span className="absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all"
                        style={{ left: notifPrefs[key] ? '18px' : '2px', width: '18px', height: '18px' }} />
                    </button>
                  </div>
                ))}
                <div className="pt-3">
                  <button type="button" onClick={saveNotifPrefs} disabled={notifSaving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
                    style={{ background: '#e8442a', color: '#fff' }}>
                    {notifSaving && <LoadingSpinner size={14} color="#fff" />}
                    Save Preferences
                  </button>
                </div>
              </div>
            </div>
          )}

          {!['identity', 'preview', 'verification', 'ebooks', 'coauthor', 'payout', 'tax', 'earnings', 'security', 'notifications'].includes(section) && (
            <div className="text-center py-16"><p className="text-[#444] text-sm">Select a section from the sidebar.</p></div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SellerProfilePage() {
  return (
    <Suspense fallback={<SellerProfilePageFallback />}>
      <SellerProfilePageContent />
    </Suspense>
  );
}
