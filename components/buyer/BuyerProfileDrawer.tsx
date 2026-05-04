'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, LogOut, ShoppingBag, Copy, Check, Star, Trash2 } from 'lucide-react';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import { useAuthStore } from '@/store/authStore';
import { updateUserProfile, logOut, changePassword, getUserProfile } from '@/lib/firebase/auth';
import { db } from '@/lib/firebase/config';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import AvatarUpload from '@/components/shared/AvatarUpload';
import Toggle from '@/components/shared/Toggle';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import PasswordInput from '@/components/shared/PasswordInput';
import ProgressBar from '@/components/shared/ProgressBar';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import { getUserLibrary, getBook, getReadingProgress, getUserWishlist, toggleWishlist, getUserOrders } from '@/lib/firebase/firestore';
import type { Book } from '@/types/book';
import type { Order } from '@/types/order';
import type { Review } from '@/types/review';

const SECTIONS = [
  { group: 'Account', items: [
    { id: 'account', label: 'My Profile' },
    { id: 'security', label: 'Security' },
  ]},
  { group: 'Reading', items: [
    { id: 'stats', label: 'Stats' },
    { id: 'library', label: 'Library' },
    { id: 'wishlist', label: 'Wishlist' },
    { id: 'reviews', label: 'Reviews' },
  ]},
  { group: 'Billing', items: [
    { id: 'history', label: 'Purchases' },
    { id: 'referral', label: 'Referral' },
  ]},
  { group: 'Settings', items: [
    { id: 'preferences', label: 'Preferences' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'privacy', label: 'Privacy' },
  ]},
];

const ALL_ITEMS = SECTIONS.flatMap((g) => g.items);

export default function BuyerProfileDrawer() {
  const { isOpen, section, setSection, close } = useBuyerDrawerStore();
  const router = useRouter();
  const { userProfile, setUserProfile, loading, firebaseUser } = useAuthStore();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', username: '', phone: '', country: '', bio: '',
  });
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const [sectionLoading, setSectionLoading] = useState(false);
  const [libraryEntries, setLibraryEntries] = useState<{ bookId: string; book: Book | null; progress: number; finished?: boolean }[]>([]);
  const [wishlistEntries, setWishlistEntries] = useState<{ id: string; bookId: string; book: Book | null }[]>([]);
  const [myReviews, setMyReviews] = useState<(Review & { bookTitle?: string })[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [readingStats, setReadingStats] = useState({ total: 0, finished: 0, inProgress: 0 });
  const [privacyPrefs, setPrivacyPrefs] = useState({
    allowRecommendations: true,
    shareReadingActivity: false,
  });

  // Sync form when profile loads
  useEffect(() => {
    if (userProfile) {
      setFormData({
        firstName: userProfile.firstName ?? '',
        lastName: userProfile.lastName ?? '',
        username: userProfile.username ?? '',
        phone: userProfile.phone ?? '',
        country: userProfile.country ?? '',
        bio: userProfile.bio ?? '',
      });
      setPrivacyPrefs({
        allowRecommendations: userProfile.notificationPreferences?.recommendations ?? true,
        shareReadingActivity: false,
      });
    }
  }, [userProfile?.uid]);

  // Fetch section data when section changes
  useEffect(() => {
    if (!isOpen || !userProfile) return;
    if (section === 'library' || section === 'stats') {
      setSectionLoading(true);
      getUserLibrary(userProfile.uid).then(async (items) => {
        const entries = await Promise.all(items.map(async (item) => {
          const [book, prog] = await Promise.all([getBook(item.bookId), getReadingProgress(userProfile.uid, item.bookId)]);
          return { bookId: item.bookId, book, progress: prog?.percentComplete ?? 0, finished: prog?.isFinished ?? false };
        }));
        setLibraryEntries(entries);
        setReadingStats({ total: entries.length, finished: entries.filter((e) => e.finished).length, inProgress: entries.filter((e) => e.progress > 0 && !e.finished).length });
        setSectionLoading(false);
      });
    }
    if (section === 'wishlist') {
      setSectionLoading(true);
      getUserWishlist(userProfile.uid).then(async (items) => {
        const entries = await Promise.all(items.map(async (item) => ({ id: item.id, bookId: item.bookId, book: await getBook(item.bookId) })));
        setWishlistEntries(entries);
        setSectionLoading(false);
      });
    }
    if (section === 'reviews') {
      setSectionLoading(true);
      getDocs(query(collection(db, 'reviews'), where('reviewerId', '==', userProfile.uid), orderBy('createdAt', 'desc'))).then(async (snap) => {
        const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
        const withTitles = await Promise.all(reviews.map(async (r) => ({ ...r, bookTitle: (await getBook(r.bookId))?.title ?? r.bookId })));
        setMyReviews(withTitles);
        setSectionLoading(false);
      });
    }
    if (section === 'history') {
      setSectionLoading(true);
      getUserOrders(userProfile.uid).then((o) => { setOrders(o); setSectionLoading(false); });
    }
  }, [section, userProfile?.uid, isOpen]);

  async function handleRemoveWishlist(wishlistItemId: string, bookId: string) {
    if (!userProfile) return;
    await toggleWishlist(userProfile.uid, bookId);
    setWishlistEntries((prev) => prev.filter((e) => e.id !== wishlistItemId));
  }

  async function saveReaderPref(key: string, value: string) {
    if (!userProfile) return;
    const prefs = { ...userProfile.readerPreferences, [key]: value };
    await updateUserProfile(userProfile.uid, { readerPreferences: prefs });
    setUserProfile({ ...userProfile, readerPreferences: prefs });
  }

  async function savePrivacy(key: string, value: boolean) {
    const updated = { ...privacyPrefs, [key]: value };
    setPrivacyPrefs(updated);
    if (!userProfile) return;
    if (key === 'allowRecommendations') {
      await updateUserProfile(userProfile.uid, { notificationPreferences: { ...userProfile.notificationPreferences, recommendations: value } });
      setUserProfile({ ...userProfile, notificationPreferences: { ...userProfile.notificationPreferences, recommendations: value } });
    }
  }

  async function handleSaveProfile() {
    if (!userProfile) return;
    setSaving(true);
    await updateUserProfile(userProfile.uid, formData);
    setUserProfile({ ...userProfile, ...formData });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleChangePassword() {
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    setPwError('');
    try {
      await changePassword(pwForm.current, pwForm.newPw);
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch { setPwError('Current password is incorrect'); }
  }

  async function handleSignOut() {
    close();
    await logOut();
    router.replace('/login');
  }

  async function handleBecomeSeller() {
    if (!userProfile) return;
    await Promise.all([
      updateUserProfile(userProfile.uid, { role: 'both', activeRole: 'seller' }),
      setDoc(doc(db, 'sellers', userProfile.uid), {
        uid: userProfile.uid, penName: null, website: '',
        socialLinks: { twitter: '', instagram: '', linkedin: '', goodreads: '' },
        stripeAccountId: null, stripeAccountStatus: 'not_connected',
        isVerified: false,
        verificationStatus: { emailVerified: true, bioAdded: false, firstBookPublished: false, idVerified: false, tenSalesReached: false },
        taxFormType: null, taxFormStatus: 'not_submitted',
        pendingBalance: 0, totalEarnings: 0, payoutSchedule: 'monthly',
        followersCount: 0, totalSales: 0, averageRating: 0,
        createdAt: serverTimestamp(),
      }, { merge: true }),
    ]);
    setUserProfile({ ...userProfile, role: 'both', activeRole: 'seller' });
    close();
    router.push('/dashboard');
  }

  async function toggleNotif(key: string, value: boolean) {
    if (!userProfile) return;
    const prefs = { ...userProfile.notificationPreferences, [key]: value };
    await updateUserProfile(userProfile.uid, { notificationPreferences: prefs });
    setUserProfile({ ...userProfile, notificationPreferences: prefs });
  }

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

        {/* Drawer header */}
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #1a1a1a' }}>
          <AvatarUpload size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userProfile.firstName} {userProfile.lastName}</p>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#0f1e3a', color: '#0ea5e9' }}>Buyer</span>
          </div>
          <button type="button" onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1a1a] flex-shrink-0"
            style={{ color: '#888' }}>
            <X size={18} />
          </button>
        </div>

        {/* Section pill nav */}
        <div className="overflow-x-auto px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a1a1a', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          <div className="flex gap-2 w-max">
            {ALL_ITEMS.map((item) => (
              <button key={item.id} type="button" onClick={() => setSection(item.id)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                style={{
                  background: section === item.id ? '#e8442a' : '#1a1a1a',
                  color: section === item.id ? '#fff' : '#888',
                  border: `1px solid ${section === item.id ? '#e8442a' : '#333'}`,
                }}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Switch to Seller / Become a Seller */}
          <div>
            {(userProfile.role === 'seller' || userProfile.role === 'both') ? (
              <button type="button"
                onClick={async () => { await updateUserProfile(userProfile.uid, { activeRole: 'seller' }); setUserProfile({ ...userProfile, activeRole: 'seller' }); close(); router.push('/dashboard'); }}
                className="w-full py-2.5 rounded-xl text-xs font-medium border flex items-center justify-center gap-2"
                style={{ borderColor: '#f5b800', color: '#f5b800' }}>
                <ShoppingBag size={13} /> Switch to Seller Dashboard
              </button>
            ) : (
              <button type="button" onClick={handleBecomeSeller}
                className="w-full py-2.5 rounded-xl text-xs font-medium border flex items-center justify-center gap-2"
                style={{ borderColor: '#f5b800', color: '#f5b800' }}>
                <ShoppingBag size={13} /> Become a Seller
              </button>
            )}
          </div>

          {/* My Profile */}
          {section === 'account' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">My Profile</h2>
              <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="grid grid-cols-2 gap-3">
                  {(['firstName', 'lastName'] as const).map((key) => (
                    <div key={key}>
                      <label className="block text-xs text-[#aaa] mb-1">{key === 'firstName' ? 'First name' : 'Last name'}</label>
                      <input value={formData[key]} onChange={(e) => setFormData((f) => ({ ...f, [key]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                    </div>
                  ))}
                </div>
                {([{ label: 'Username', key: 'username' }, { label: 'Phone', key: 'phone' }, { label: 'Country', key: 'country' }] as const).map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-xs text-[#aaa] mb-1">{label}</label>
                    <input value={formData[key]} onChange={(e) => setFormData((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs text-[#aaa] mb-1">Bio</label>
                  <textarea value={formData.bio} onChange={(e) => setFormData((f) => ({ ...f, bio: e.target.value }))}
                    rows={3} className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
                    style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <button type="button" onClick={handleSaveProfile} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: saved ? '#4ade80' : '#e8442a', color: saved ? '#000' : '#fff' }}>
                  {saving ? <LoadingSpinner size={13} color="#fff" /> : saved ? <Check size={13} /> : null}
                  {saved ? 'Saved' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* Security */}
          {section === 'security' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Password & Security</h2>
              <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                {([{ label: 'Current password', key: 'current' }, { label: 'New password', key: 'newPw' }, { label: 'Confirm', key: 'confirm' }] as const).map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-xs text-[#aaa] mb-1">{label}</label>
                    <PasswordInput value={pwForm[key]} onChange={(e) => setPwForm((f) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
                {pwError && <p className="text-xs text-[#e8442a]">{pwError}</p>}
                {pwSuccess && <p className="text-xs" style={{ color: '#4ade80' }}>Password changed.</p>}
                <button type="button" onClick={handleChangePassword}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#e8442a', color: '#fff' }}>
                  Update Password
                </button>
              </div>
            </div>
          )}

          {/* Notifications */}
          {section === 'notifications' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Notifications</h2>
              <div className="p-5 rounded-xl border space-y-3" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                {([
                  ['purchaseConfirmations', 'Purchase confirmations'],
                  ['readingReminders', 'Reading reminders'],
                  ['newChapterAlerts', 'New chapter alerts'],
                  ['reviewReplies', 'Review replies'],
                  ['flashSales', 'Flash sales'],
                  ['recommendations', 'Recommendations'],
                  ['emailReceipts', 'Email receipts'],
                  ['weeklyDigest', 'Weekly digest'],
                  ['promotionalEmails', 'Promotional emails'],
                ] as const).map(([key, label]) => (
                  <Toggle key={key} checked={userProfile.notificationPreferences[key]} onChange={(v) => toggleNotif(key, v)} label={label} />
                ))}
              </div>
            </div>
          )}

          {/* Referral */}
          {section === 'referral' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Referral Program</h2>
              <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <p className="text-xs text-[#aaa] mb-2">Your referral code</p>
                <div className="flex items-center gap-3 mb-4">
                  <p className="font-display text-3xl" style={{ color: '#f5b800' }}>{userProfile.referralCode}</p>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(userProfile.referralCode); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
                    className="p-2 rounded-lg border" style={{ borderColor: '#333', color: codeCopied ? '#4ade80' : '#888' }}>
                    {codeCopied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
                <div className="p-4 rounded-xl border" style={{ background: '#1a1a1a', borderColor: '#2a2a2a' }}>
                  <p className="text-xs text-[#555]">Credits earned</p>
                  <p className="font-display text-2xl mt-1" style={{ color: '#f5b800' }}>{centsToDisplay(userProfile.referralCredits)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Privacy */}
          {section === 'privacy' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Privacy & Data</h2>
              <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="space-y-3 mb-5">
                  <Toggle checked={privacyPrefs.allowRecommendations} onChange={(v) => savePrivacy('allowRecommendations', v)} label="Allow personalized recommendations" />
                  <Toggle checked={privacyPrefs.shareReadingActivity} onChange={(v) => savePrivacy('shareReadingActivity', v)} label="Share reading activity" />
                </div>
                <div className="border-t pt-4 space-y-2" style={{ borderColor: '#1a1a1a' }}>
                  <p className="text-xs text-[#555] uppercase tracking-wider mb-2">Legal</p>
                  <div className="flex gap-4">
                    <Link href="/terms" onClick={close} className="text-xs text-[#888] underline underline-offset-2">Terms of Service</Link>
                    <Link href="/terms#privacy" onClick={close} className="text-xs text-[#888] underline underline-offset-2">Privacy Policy</Link>
                  </div>
                </div>
                <div className="border-t pt-4 mt-4" style={{ borderColor: '#1a1a1a' }}>
                  <button type="button" className="w-full py-2.5 rounded-lg text-xs border" style={{ borderColor: '#e8442a', color: '#e8442a' }}>
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preferences */}
          {section === 'preferences' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Preferences</h2>
              <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                {[
                  { label: 'Font Size', value: userProfile.readerPreferences.fontSize, options: ['small', 'medium', 'large', 'xlarge'], key: 'fontSize' },
                  { label: 'Theme', value: userProfile.readerPreferences.theme, options: ['parchment', 'dark', 'white', 'sepia'], key: 'theme' },
                  { label: 'Line Spacing', value: userProfile.readerPreferences.lineSpacing, options: ['compact', 'normal', 'relaxed'], key: 'lineSpacing' },
                ].map(({ label, value, options, key }) => (
                  <div key={key}>
                    <p className="text-xs text-[#555] mb-1.5">{label}</p>
                    <div className="flex flex-wrap gap-2">
                      {options.map((o) => (
                        <button key={o} type="button" onClick={() => saveReaderPref(key, o)}
                          className="px-3 py-1.5 rounded-lg text-xs capitalize"
                          style={{ background: value === o ? '#e8442a' : '#1a1a1a', color: value === o ? '#fff' : '#888', border: `1px solid ${value === o ? '#e8442a' : '#333'}` }}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reading Stats */}
          {section === 'stats' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Reading Stats</h2>
              {sectionLoading ? <div className="flex justify-center py-12"><LoadingSpinner size={28} /></div> : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Owned', value: readingStats.total, color: '#f5b800' },
                      { label: 'Finished', value: readingStats.finished, color: '#4ade80' },
                      { label: 'In Progress', value: readingStats.inProgress, color: '#0ea5e9' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="p-3 rounded-xl border text-center" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                        <p className="font-display text-2xl" style={{ color }}>{value}</p>
                        <p className="text-xs text-[#555] mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  {libraryEntries.filter((e) => e.progress > 0 && !e.finished).length > 0 && (
                    <div className="p-4 rounded-xl border space-y-3" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                      <p className="text-xs font-medium text-white">Currently Reading</p>
                      {libraryEntries.filter((e) => e.progress > 0 && !e.finished).map((e) => (
                        <div key={e.bookId}>
                          <div className="flex justify-between mb-1">
                            <p className="text-xs text-[#aaa] truncate">{e.book?.title ?? e.bookId}</p>
                            <p className="text-xs text-[#555]">{e.progress}%</p>
                          </div>
                          <ProgressBar value={e.progress} max={100} color="#e8442a" height={4} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Library */}
          {section === 'library' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">My Library</h2>
              {sectionLoading ? <div className="flex justify-center py-12"><LoadingSpinner size={28} /></div>
                : libraryEntries.length === 0 ? <p className="text-center py-10 text-[#444] text-sm">No books yet. <Link href="/browse" onClick={close} className="underline" style={{ color: '#e8442a' }}>Browse</Link></p>
                : (
                  <div className="grid grid-cols-2 gap-3">
                    {libraryEntries.map((e) => e.book && (
                      <Link key={e.bookId} href={`/read/${e.bookId}`} onClick={close}
                        className="rounded-xl overflow-hidden border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                        <div className="aspect-[2/3] flex items-center justify-center text-xl font-bold overflow-hidden"
                          style={{ background: e.book.coverBgColor, color: e.book.coverAccentColor }}>
                          {e.book.coverUrl ? <img src={e.book.coverUrl} alt={e.book.title} className="w-full h-full object-cover" /> : e.book.title.charAt(0)}
                        </div>
                        <div className="p-2.5 space-y-1">
                          <p className="text-xs font-medium text-white truncate">{e.book.title}</p>
                          <ProgressBar value={e.progress} max={100} color="#e8442a" height={3} />
                          <p className="text-xs text-[#555]">{e.progress}%</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* Wishlist */}
          {section === 'wishlist' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Wishlist</h2>
              {sectionLoading ? <div className="flex justify-center py-12"><LoadingSpinner size={28} /></div>
                : wishlistEntries.length === 0 ? <p className="text-center py-10 text-[#444] text-sm">Your wishlist is empty.</p>
                : (
                  <div className="space-y-2">
                    {wishlistEntries.map((e) => e.book && (
                      <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                        <div className="w-9 h-12 rounded flex-shrink-0 overflow-hidden" style={{ background: e.book.coverBgColor }}>
                          {e.book.coverUrl && <img src={e.book.coverUrl} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{e.book.title}</p>
                          <p className="text-xs text-[#555]">{e.book.authorName}</p>
                          <p className="text-xs" style={{ color: '#f5b800' }}>{centsToDisplay(e.book.price)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Link href={`/book/${e.bookId}`} onClick={close}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: '#e8442a', color: '#fff' }}>
                            View
                          </Link>
                          <button type="button" onClick={() => handleRemoveWishlist(e.id, e.bookId)} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]">
                            <Trash2 size={12} style={{ color: '#e8442a' }} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* My Reviews */}
          {section === 'reviews' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">My Reviews</h2>
              {sectionLoading ? <div className="flex justify-center py-12"><LoadingSpinner size={28} /></div>
                : myReviews.length === 0 ? <p className="text-center py-10 text-[#444] text-sm">No reviews yet.</p>
                : (
                  <div className="space-y-3">
                    {myReviews.map((r) => (
                      <div key={r.id} className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <Link href={`/book/${r.bookId}`} onClick={close} className="text-xs font-medium text-white hover:underline">{r.bookTitle}</Link>
                          <div className="flex gap-0.5 flex-shrink-0">
                            {[1,2,3,4,5].map((s) => <Star key={s} size={11} fill={s <= r.stars ? '#f5b800' : 'none'} style={{ color: '#f5b800' }} />)}
                          </div>
                        </div>
                        <p className="text-xs text-[#888] leading-relaxed">{r.body}</p>
                        <p className="text-xs text-[#444] mt-1">{r.createdAt?.toDate?.()?.toLocaleDateString?.() ?? ''}</p>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* Purchase History */}
          {section === 'history' && (
            <div className="space-y-4">
              <h2 className="font-display text-display-sm text-white">Purchase History</h2>
              {sectionLoading ? <div className="flex justify-center py-12"><LoadingSpinner size={28} /></div>
                : orders.length === 0 ? <p className="text-center py-10 text-[#444] text-sm">No purchases yet.</p>
                : (
                  <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                    <table className="w-full text-sm min-w-[360px]">
                      <thead><tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                        {['Date', 'Book', 'Amount', 'Status'].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-[#555] uppercase">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id} style={{ borderBottom: '1px solid #111' }}>
                            <td className="px-3 py-2.5 text-xs text-[#555]">{o.createdAt?.toDate?.()?.toLocaleDateString?.() ?? '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-[#aaa] max-w-[120px] truncate">{o.bookTitle}</td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: '#f5b800' }}>{centsToDisplay(o.finalPrice)}</td>
                            <td className="px-3 py-2.5">
                              <span className="text-xs px-2 py-0.5 rounded capitalize"
                                style={{ background: o.status === 'completed' ? '#0f2e1a' : '#1a1a1a', color: o.status === 'completed' ? '#4ade80' : '#aaa' }}>
                                {o.status}
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

        </div>

        {/* Drawer footer */}
        <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid #1a1a1a' }}>
          <button type="button" onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-colors hover:bg-[#1a1a1a]"
            style={{ color: '#666' }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    </>
  );
}
