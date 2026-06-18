'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { updateUserProfile, logOut, changePassword, getUserProfile } from '@/lib/firebase/auth';
import { db } from '@/lib/firebase/config';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc, orderBy } from 'firebase/firestore';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import Toggle from '@/components/shared/Toggle';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import AvatarUpload from '@/components/shared/AvatarUpload';
import PasswordInput from '@/components/shared/PasswordInput';
import ProgressBar from '@/components/shared/ProgressBar';
import WorkspaceSwitcher from '@/components/shared/WorkspaceSwitcher';
import { DEFAULT_SELLER_VERIFICATION_STATUS } from '@/lib/sellerVerification';
import { useState, useEffect } from 'react';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import { getWorkspaceDestination, getWorkspaceLabel, hasAuthorWorkspace, type WorkspaceRole } from '@/lib/utils/workspace';
import { LogOut, Copy, Check, Star, BookOpen, Trash2, ShoppingBag, BadgeCheck } from 'lucide-react';
import { getUserLibrary, getBook, getReadingProgress, getUserWishlist, toggleWishlist, getUserOrders } from '@/lib/firebase/firestore';
import type { Book } from '@/types/book';
import type { Order } from '@/types/order';
import type { Review } from '@/types/review';

const SIDEBAR_GROUPS = [
  { label: 'Account', items: [
    { id: 'account', label: 'My Profile' },
    { id: 'security', label: 'Password & Security' },
  ]},
  { label: 'Reading', items: [
    { id: 'stats', label: 'Reading Stats' },
    { id: 'library', label: 'My Library' },
    { id: 'wishlist', label: 'Wishlist' },
    { id: 'reviews', label: 'My Reviews' },
  ]},
  { label: 'Billing', items: [
    { id: 'history', label: 'Purchase History' },
    { id: 'referral', label: 'Referral Program' },
  ]},
  { label: 'Settings', items: [
    { id: 'preferences', label: 'Preferences' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'privacy', label: 'Privacy & Data' },
  ]},
];

export default function BuyerProfilePage() {
  const { section } = useParams<{ section: string }>();
  const router = useRouter();
  const { userProfile, setUserProfile, loading, firebaseUser } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [formData, setFormData] = useState({
    firstName: userProfile?.firstName ?? '',
    lastName: userProfile?.lastName ?? '',
    username: userProfile?.username ?? '',
    phone: userProfile?.phone ?? '',
    country: userProfile?.country ?? '',
    bio: userProfile?.bio ?? '',
  });
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  // Section data
  const [sectionLoading, setSectionLoading] = useState(false);
  const [libraryEntries, setLibraryEntries] = useState<{ bookId: string; book: Book | null; progress: number }[]>([]);
  const [wishlistEntries, setWishlistEntries] = useState<{ id: string; bookId: string; book: Book | null }[]>([]);
  const [myReviews, setMyReviews] = useState<(Review & { bookTitle?: string })[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [readingStats, setReadingStats] = useState({ total: 0, finished: 0, inProgress: 0 });
  const [privacyPrefs, setPrivacyPrefs] = useState({
    allowRecommendations: userProfile?.notificationPreferences?.recommendations ?? true,
    shareReadingActivity: false,
  });

  useEffect(() => {
    if (!userProfile) return;
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
        const withTitles = await Promise.all(reviews.map(async (r) => {
          const book = await getBook(r.bookId);
          return { ...r, bookTitle: book?.title ?? r.bookId };
        }));
        setMyReviews(withTitles);
        setSectionLoading(false);
      });
    }
    if (section === 'history') {
      setSectionLoading(true);
      getUserOrders(userProfile.uid).then((o) => { setOrders(o); setSectionLoading(false); });
    }
  }, [section, userProfile?.uid]);

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
    await logOut();
    router.replace('/login');
  }

  async function handleBecomeSeller() {
    if (!userProfile) return;
    await Promise.all([
      updateUserProfile(userProfile.uid, { role: 'both', activeRole: 'buyer' }),
      setDoc(doc(db, 'sellers', userProfile.uid), {
        uid: userProfile.uid,
        penName: null,
        website: '',
        socialLinks: { twitter: '', instagram: '', linkedin: '', goodreads: '' },
        stripeAccountId: null,
        stripeAccountStatus: 'not_connected',
        isVerified: false,
        verificationStatus: {
          ...DEFAULT_SELLER_VERIFICATION_STATUS,
          bioAdded: userProfile.bio.trim().length >= 50,
        },
        taxFormType: null,
        taxFormStatus: 'not_submitted',
        pendingBalance: 0,
        totalEarnings: 0,
        payoutSchedule: 'monthly',
        nextPayoutDate: serverTimestamp(),
        followersCount: 0,
        totalSales: 0,
        averageRating: 0,
        createdAt: serverTimestamp(),
      }, { merge: true }),
    ]);
    setUserProfile({ ...userProfile, role: 'both', activeRole: 'buyer' });
  }

  async function handleWorkspaceChange(nextRole: WorkspaceRole) {
    if (!userProfile || userProfile.activeRole === nextRole) return;
    await updateUserProfile(userProfile.uid, { activeRole: nextRole });
    setUserProfile({ ...userProfile, activeRole: nextRole });
    router.push(getWorkspaceDestination(nextRole));
  }

  async function toggleNotif(key: string, value: boolean) {
    if (!userProfile) return;
    const prefs = { ...userProfile.notificationPreferences, [key]: value };
    await updateUserProfile(userProfile.uid, { notificationPreferences: prefs });
    setUserProfile({ ...userProfile, notificationPreferences: prefs });
  }

  useEffect(() => {
    if (!loading && !userProfile && firebaseUser) {
      getUserProfile(firebaseUser.uid).then((p) => { if (p) setUserProfile(p); });
    }
  }, [loading, userProfile, firebaseUser]);

  useEffect(() => {
    if (!loading && !firebaseUser && !userProfile) {
      router.replace('/browse');
    }
  }, [loading, firebaseUser, userProfile, router]);

  if (loading || (!userProfile && firebaseUser)) return <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]"><LoadingSpinner size={32} /></div>;
  if (!userProfile) return null;

  const initials = `${userProfile.firstName[0] ?? ''}${userProfile.lastName[0] ?? ''}`.toUpperCase();
  const buyerProfileCompletion = [
    !!userProfile.firstName.trim(),
    !!userProfile.username.trim(),
    userProfile.bio.trim().length >= 20,
    !!userProfile.country.trim(),
  ].filter(Boolean).length;
  const canAccessAuthorWorkspace = hasAuthorWorkspace(userProfile);

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      {/* Mobile section picker — horizontal scrollable pills, hidden on desktop */}
      <div className="sm:hidden overflow-x-auto px-4 pt-4 pb-1" style={{ borderBottom: '1px solid #1a1a1a' }}>
        <div className="flex gap-2 w-max">
          {SIDEBAR_GROUPS.flatMap((g) => g.items).map((item) => (
            <Link
              key={item.id}
              href={`/profile/${item.id}`}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
              style={{
                background: section === item.id ? '#e8442a' : '#1a1a1a',
                color: section === item.id ? '#fff' : '#888',
                border: `1px solid ${section === item.id ? '#e8442a' : '#333'}`,
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
          <div className="flex flex-col items-center py-5 mb-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <AvatarUpload size={56} />
            <p className="text-sm font-medium text-white mt-2">{userProfile.firstName} {userProfile.lastName}</p>
            <span className="mt-1 text-xs px-2 py-0.5 rounded" style={{ background: '#1a1a2e', color: '#0ea5e9' }}>Reader</span>
          </div>

          <nav className="space-y-4">
            {SIDEBAR_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs text-[#444] uppercase tracking-wider px-3 mb-1">{group.label}</p>
                {group.items.map((item) => (
                  <Link key={item.id} href={`/profile/${item.id}`}
                    className="block px-3 py-2 rounded-lg text-sm transition-colors"
                    style={{ background: section === item.id ? '#1f0e0c' : 'transparent', color: section === item.id ? '#e8442a' : '#888' }}>
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <button type="button" onClick={handleSignOut}
            className="mt-4 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[#1a1a1a]"
            style={{ color: '#666' }}>
            <LogOut size={14} /> Sign out
          </button>

          <div className="mt-2 space-y-2">
            {canAccessAuthorWorkspace ? (
              <WorkspaceSwitcher
                activeRole={userProfile.activeRole}
                onChange={handleWorkspaceChange}
                fullWidth
                showLabel
                size="sm"
              />
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#666]">Workspace</p>
                <button type="button" onClick={handleBecomeSeller}
                  className="w-full py-2 rounded-lg text-xs font-medium border"
                  style={{ borderColor: '#f5b800', color: '#f5b800' }}>
                  Create Author Workspace
                </button>
              </>
            )}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div
            className="mb-5 p-5 sm:p-6 rounded-2xl border space-y-5"
            style={{
              background: 'linear-gradient(135deg, rgba(232,68,42,0.16) 0%, rgba(17,17,17,0.96) 38%, rgba(14,165,233,0.12) 100%)',
              borderColor: '#1f2937',
            }}
          >
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div className="flex items-start gap-4">
                <div
                  className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-lg font-bold flex-shrink-0"
                  style={{ background: '#141414', color: '#f5b800', border: '1px solid #2a2a2a' }}
                >
                  {userProfile.avatarUrl
                    ? <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : initials || '?'}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-display-sm text-white">
                      {userProfile.firstName} {userProfile.lastName}
                    </h1>
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#1a1a2e', color: '#7dd3fc' }}>
                      Reader
                    </span>
                    {userProfile.subscriptionStatus === 'active' && (
                      <span className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{ background: '#2e1a0f', color: '#f5b800' }}>
                        <BadgeCheck size={12} /> {userProfile.subscriptionPlan}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#94a3b8]">
                    {userProfile.username ? `@${userProfile.username}` : 'Add a username to complete your reader profile'}
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: userProfile.bio ? '#d1d5db' : '#6b7280' }}>
                    {userProfile.bio || 'Add a short bio to personalize your profile and recommendations.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                {canAccessAuthorWorkspace ? (
                  <WorkspaceSwitcher
                    activeRole={userProfile.activeRole}
                    onChange={handleWorkspaceChange}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={handleBecomeSeller}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium border"
                    style={{ borderColor: '#f5b800', color: '#f5b800' }}
                  >
                    Create Author Workspace
                  </button>
                )}
                <Link
                  href="/profile/preferences"
                  className="px-4 py-2.5 rounded-xl text-sm font-medium border text-center"
                  style={{ borderColor: '#333', color: '#aaa' }}
                >
                  Personalize
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: 'Profile Completion', value: `${buyerProfileCompletion}/4`, hint: 'Reader setup' },
                { label: 'Subscription', value: userProfile.subscriptionStatus === 'active' ? userProfile.subscriptionPlan : 'Free', hint: 'Current plan' },
                { label: 'Referral Credits', value: centsToDisplay(userProfile.referralCredits), hint: 'Wallet bonus' },
                { label: 'Workspace', value: getWorkspaceLabel(userProfile.activeRole), hint: 'Active experience' },
              ].map(({ label, value, hint }) => (
                <div key={label} className="p-3 rounded-xl border" style={{ background: 'rgba(17,17,17,0.86)', borderColor: '#1f2937' }}>
                  <p className="text-xs text-[#6b7280]">{label}</p>
                  <p className="font-display text-xl text-white mt-1">{value}</p>
                  <p className="text-xs text-[#4b5563] mt-1">{hint}</p>
                </div>
              ))}
            </div>

            <ProgressBar value={buyerProfileCompletion} max={4} color="#f5b800" height={6} showLabel />
          </div>

          {/* Mobile seller switch — desktop has this in the sidebar */}
          <div className="sm:hidden mb-5">
            {canAccessAuthorWorkspace ? (
              <WorkspaceSwitcher
                activeRole={userProfile.activeRole}
                onChange={handleWorkspaceChange}
                fullWidth
                showLabel
              />
            ) : (
              <button
                type="button"
                onClick={handleBecomeSeller}
                className="w-full py-3 rounded-xl text-sm font-medium border flex items-center justify-center gap-2"
                style={{ borderColor: '#f5b800', color: '#f5b800' }}
              >
                <ShoppingBag size={15} /> Create Author Workspace
              </button>
            )}
          </div>

          {/* My Profile */}
          {section === 'account' && (
            <div className="space-y-5">
              <h1 className="font-display text-display-sm text-white">My Profile</h1>
              <div className="p-6 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: 'First name', key: 'firstName' },
                    { label: 'Last name', key: 'lastName' },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-sm text-[#aaa] mb-1.5">{label}</label>
                      <input type="text" value={formData[key as keyof typeof formData]}
                        onChange={(e) => setFormData((f) => ({ ...f, [key]: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-lg border text-sm"
                        style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                    </div>
                  ))}
                </div>
                {[
                  { label: 'Username', key: 'username' },
                  { label: 'Phone', key: 'phone' },
                  { label: 'Country', key: 'country' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-sm text-[#aaa] mb-1.5">{label}</label>
                    <input type="text" value={formData[key as keyof typeof formData]}
                      onChange={(e) => setFormData((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border text-sm"
                      style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                  </div>
                ))}
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">Bio</label>
                  <textarea value={formData.bio} onChange={(e) => setFormData((f) => ({ ...f, bio: e.target.value }))}
                    rows={3} className="w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none"
                    style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <button type="button" onClick={handleSaveProfile} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: saved ? '#4ade80' : '#e8442a', color: saved ? '#000' : '#fff' }}>
                  {saving ? <LoadingSpinner size={14} color="#fff" /> : saved ? <Check size={14} /> : null}
                  {saved ? 'Saved' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* Security */}
          {section === 'security' && (
            <div className="space-y-5">
              <h1 className="font-display text-display-sm text-white">Password & Security</h1>
              <div className="p-6 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                {[
                  { label: 'Current password', key: 'current', value: pwForm.current },
                  { label: 'New password', key: 'newPw', value: pwForm.newPw },
                  { label: 'Confirm new password', key: 'confirm', value: pwForm.confirm },
                ].map(({ label, key, value }) => (
                  <div key={key}>
                    <label className="block text-sm text-[#aaa] mb-1.5">{label}</label>
                    <PasswordInput value={value}
                      onChange={(e) => setPwForm((f) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
                {pwError && <p className="text-sm text-[#e8442a]">{pwError}</p>}
                {pwSuccess && <p className="text-sm" style={{ color: '#4ade80' }}>Password changed successfully.</p>}
                <button type="button" onClick={handleChangePassword}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: '#e8442a', color: '#fff' }}>
                  Update Password
                </button>
              </div>
            </div>
          )}

          {/* Notifications */}
          {section === 'notifications' && (
            <div className="space-y-5">
              <h1 className="font-display text-display-sm text-white">Notifications</h1>
              <div className="p-6 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <p className="text-sm font-medium text-white">In-App</p>
                {([
                  ['purchaseConfirmations', 'Purchase confirmations'],
                  ['readingReminders', 'Reading reminders'],
                  ['newChapterAlerts', 'New chapter alerts'],
                  ['reviewReplies', 'Review replies'],
                  ['flashSales', 'Flash sales'],
                  ['recommendations', 'Personalized recommendations'],
                ] as const).map(([key, label]) => (
                  <Toggle key={key} checked={userProfile.notificationPreferences[key]} onChange={(v) => toggleNotif(key, v)} label={label} />
                ))}
                <div className="border-t pt-4" style={{ borderColor: '#1a1a1a' }}>
                  <p className="text-sm font-medium text-white mb-3">Email</p>
                  {([
                    ['emailReceipts', 'Email receipts'],
                    ['weeklyDigest', 'Weekly digest'],
                    ['promotionalEmails', 'Promotional emails'],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="mb-3">
                      <Toggle checked={userProfile.notificationPreferences[key]} onChange={(v) => toggleNotif(key, v)} label={label} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Referral */}
          {section === 'referral' && (
            <div className="space-y-5">
              <h1 className="font-display text-display-sm text-white">Referral Program</h1>
              <div className="p-6 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <p className="text-sm text-[#aaa] mb-2">Your referral code</p>
                <div className="flex items-center gap-3 mb-5">
                  <p className="font-display text-3xl" style={{ color: '#f5b800' }}>{userProfile.referralCode}</p>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(userProfile.referralCode); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
                    className="p-2 rounded-lg border" style={{ borderColor: '#333', color: codeCopied ? '#4ade80' : '#888' }}>
                    {codeCopied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border" style={{ background: '#1a1a1a', borderColor: '#2a2a2a' }}>
                    <p className="text-xs text-[#555]">Credits earned</p>
                    <p className="font-display text-2xl mt-1" style={{ color: '#f5b800' }}>{centsToDisplay(userProfile.referralCredits)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Privacy */}
          {section === 'privacy' && (
            <div className="space-y-5">
              <h1 className="font-display text-display-sm text-white">Privacy & Data</h1>
              <div className="p-6 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="space-y-3 mb-6">
                  <Toggle checked={privacyPrefs.allowRecommendations} onChange={(v) => savePrivacy('allowRecommendations', v)} label="Allow personalized recommendations" />
                  <Toggle checked={privacyPrefs.shareReadingActivity} onChange={(v) => savePrivacy('shareReadingActivity', v)} label="Share reading activity" />
                </div>
                <div className="border-t pt-5 space-y-3" style={{ borderColor: '#1a1a1a' }}>
                  <p className="text-xs text-[#555] uppercase tracking-wider">Legal</p>
                  <div className="flex gap-4">
                    <Link href="/terms" className="text-sm text-[#888] hover:text-white transition-colors underline underline-offset-2">
                      Terms of Service
                    </Link>
                    <Link href="/terms#privacy" className="text-sm text-[#888] hover:text-white transition-colors underline underline-offset-2">
                      Privacy Policy
                    </Link>
                  </div>
                </div>
                <div className="border-t pt-5 space-y-3" style={{ borderColor: '#1a1a1a' }}>
                  <p className="text-sm font-medium text-[#e8442a]">Danger Zone</p>
                  <button type="button" className="w-full py-2.5 rounded-lg text-sm border" style={{ borderColor: '#e8442a', color: '#e8442a' }}>
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preferences */}
          {section === 'preferences' && (
            <div className="space-y-5">
              <h1 className="font-display text-display-sm text-white">Preferences</h1>
              <div className="p-6 rounded-xl border space-y-5" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div>
                  <p className="text-sm font-medium text-white mb-3">Reader Settings</p>
                  {[
                    { label: 'Font Size', value: userProfile.readerPreferences.fontSize, options: ['small', 'medium', 'large', 'xlarge'], key: 'fontSize' },
                    { label: 'Theme', value: userProfile.readerPreferences.theme, options: ['parchment', 'dark', 'white', 'sepia'], key: 'theme' },
                    { label: 'Line Spacing', value: userProfile.readerPreferences.lineSpacing, options: ['compact', 'normal', 'relaxed'], key: 'lineSpacing' },
                  ].map(({ label, value, options, key }) => (
                    <div key={key} className="mb-3">
                      <p className="text-xs text-[#555] mb-1.5">{label}</p>
                      <div className="flex gap-2">
                        {options.map((o) => (
                          <button key={o} type="button"
                            onClick={() => saveReaderPref(key, o)}
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
            </div>
          )}

          {/* Reading Stats */}
          {section === 'stats' && (
            <div className="space-y-5">
              <h1 className="font-display text-display-sm text-white">Reading Stats</h1>
              {sectionLoading ? <div className="flex justify-center py-16"><LoadingSpinner size={28} /></div> : (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Books Owned', value: readingStats.total, color: '#f5b800' },
                      { label: 'Finished', value: readingStats.finished, color: '#4ade80' },
                      { label: 'In Progress', value: readingStats.inProgress, color: '#0ea5e9' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="p-4 rounded-xl border text-center" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                        <p className="font-display text-3xl" style={{ color }}>{value}</p>
                        <p className="text-xs text-[#555] mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                  {userProfile.favoriteGenre && (
                    <div className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                      <p className="text-xs text-[#555] mb-1">Favourite Genre</p>
                      <p className="text-sm text-white">{userProfile.favoriteGenre}</p>
                    </div>
                  )}
                  {libraryEntries.filter((e) => e.progress > 0 && !('finished' in e && e.finished)).length > 0 && (
                    <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                      <p className="text-sm font-medium text-white">Currently Reading</p>
                      {libraryEntries.filter((e: any) => e.progress > 0 && !e.finished).map((e) => (
                        <div key={e.bookId}>
                          <div className="flex items-center justify-between mb-1">
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

          {/* My Library */}
          {section === 'library' && (
            <div className="space-y-4">
              <h1 className="font-display text-display-sm text-white">My Library</h1>
              {sectionLoading ? <div className="flex justify-center py-16"><LoadingSpinner size={28} /></div>
                : libraryEntries.length === 0 ? <p className="text-center py-12 text-[#444] text-sm">Your library is empty. <Link href="/browse" className="underline" style={{ color: '#e8442a' }}>Browse books</Link></p>
                : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {libraryEntries.map((e) => e.book && (
                      <Link key={e.bookId} href={`/read/${e.bookId}`}
                        className="rounded-xl overflow-hidden border transition-colors hover:border-[#333]"
                        style={{ background: '#111', borderColor: '#1a1a1a' }}>
                        <div className="aspect-[2/3] flex items-center justify-center text-2xl font-bold"
                          style={{ background: e.book.coverBgColor, color: e.book.coverAccentColor }}>
                          {e.book.coverUrl ? <img src={e.book.coverUrl} alt={e.book.title} className="w-full h-full object-cover" /> : e.book.title.charAt(0)}
                        </div>
                        <div className="p-3 space-y-1.5">
                          <p className="text-xs font-medium text-white truncate">{e.book.title}</p>
                          <ProgressBar value={e.progress} max={100} color="#e8442a" height={3} />
                          <p className="text-xs text-[#555]">{e.progress}% complete</p>
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
              <h1 className="font-display text-display-sm text-white">Wishlist</h1>
              {sectionLoading ? <div className="flex justify-center py-16"><LoadingSpinner size={28} /></div>
                : wishlistEntries.length === 0 ? <p className="text-center py-12 text-[#444] text-sm">Your wishlist is empty.</p>
                : (
                  <div className="space-y-3">
                    {wishlistEntries.map((e) => e.book && (
                      <div key={e.id} className="flex items-center gap-4 p-4 rounded-xl border"
                        style={{ background: '#111', borderColor: '#1a1a1a' }}>
                        <div className="w-10 h-14 rounded flex-shrink-0 flex items-center justify-center text-lg font-bold overflow-hidden"
                          style={{ background: e.book.coverBgColor, color: e.book.coverAccentColor }}>
                          {e.book.coverUrl ? <img src={e.book.coverUrl} alt={e.book.title} className="w-full h-full object-cover" /> : e.book.title.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{e.book.title}</p>
                          <p className="text-xs text-[#555]">{e.book.authorName}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#f5b800' }}>{centsToDisplay(e.book.price)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link href={`/book/${e.bookId}`}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium"
                            style={{ background: '#e8442a', color: '#fff' }}>
                            View
                          </Link>
                          <button type="button" title="Remove from wishlist" onClick={() => handleRemoveWishlist(e.id, e.bookId)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-[#2a2a2a]">
                            <Trash2 size={13} style={{ color: '#e8442a' }} />
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
              <h1 className="font-display text-display-sm text-white">My Reviews</h1>
              {sectionLoading ? <div className="flex justify-center py-16"><LoadingSpinner size={28} /></div>
                : myReviews.length === 0 ? <p className="text-center py-12 text-[#444] text-sm">You haven't written any reviews yet.</p>
                : (
                  <div className="space-y-3">
                    {myReviews.map((r) => (
                      <div key={r.id} className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <Link href={`/book/${r.bookId}`} className="text-sm font-medium text-white hover:underline">{r.bookTitle}</Link>
                          <div className="flex gap-0.5 flex-shrink-0">
                            {[1,2,3,4,5].map((s) => <Star key={s} size={12} fill={s <= r.stars ? '#f5b800' : 'none'} style={{ color: '#f5b800' }} />)}
                          </div>
                        </div>
                        {r.title && <p className="text-xs font-medium text-white mb-1">{r.title}</p>}
                        <p className="text-xs text-[#888] leading-relaxed">{r.body}</p>
                        <p className="text-xs text-[#444] mt-2">{r.createdAt?.toDate?.()?.toLocaleDateString?.() ?? ''}</p>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* Purchase History */}
          {section === 'history' && (
            <div className="space-y-4">
              <h1 className="font-display text-display-sm text-white">Purchase History</h1>
              {sectionLoading ? <div className="flex justify-center py-16"><LoadingSpinner size={28} /></div>
                : orders.length === 0 ? <p className="text-center py-12 text-[#444] text-sm">No purchase history is available yet.</p>
                : (
                  <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                    <table className="w-full text-sm min-w-[420px]">
                      <thead><tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                        {['Date', 'Book', 'Amount', 'Status'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id} style={{ borderBottom: '1px solid #111' }}>
                            <td className="px-4 py-3 text-xs text-[#555]">{o.createdAt?.toDate?.()?.toLocaleDateString?.() ?? '—'}</td>
                            <td className="px-4 py-3 text-[#aaa] max-w-[180px] truncate">{o.bookTitle}</td>
                            <td className="px-4 py-3" style={{ color: '#f5b800' }}>{centsToDisplay(o.finalPrice)}</td>
                            <td className="px-4 py-3">
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

          {/* Fallback */}
          {!['account', 'security', 'notifications', 'referral', 'privacy', 'preferences', 'library', 'history', 'wishlist', 'reviews', 'stats'].includes(section) && (
            <div className="text-center py-16">
              <p className="text-[#444] text-sm">Select a section from the sidebar.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
