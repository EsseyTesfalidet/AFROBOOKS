'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ArrowLeft, ArrowRight } from 'lucide-react';
import SellerHeader from '@/components/seller/SellerHeader';
import ChapterEditor from '@/components/seller/ChapterEditor';
import { useAuthStore } from '@/store/authStore';
import { uploadCoverImage, uploadManuscript } from '@/lib/firebase/storage';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { calculateEarnings } from '@/lib/utils/calculateEarnings';
import { getPlatformSettings, getSellerPublishedBooksCount } from '@/lib/firebase/firestore';
import {
  DEFAULT_SELLER_VERIFICATION_STATUS,
  SELLER_BOOKS_BEFORE_ID_VERIFICATION,
  getRemainingGraceBooksBeforeIdVerification,
  hasCompletedSellerVerification,
  requiresSellerIdVerificationForPublishing,
} from '@/lib/sellerVerification';
import type { Chapter } from '@/types/book';
import type { CopyrightBasis } from '@/types/book';
import type { Seller } from '@/types/user';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { ShieldAlert } from 'lucide-react';
import { importManuscriptFile } from '@/lib/publishing/manuscriptImport';
import { COPYRIGHT_BASIS_OPTIONS, getCopyrightBasisLabel, requiresManualCopyrightReview } from '@/lib/utils/copyright';

const STEPS = ['Details', 'Cover', 'Book Content', 'Pricing', 'Publish'];
const GENRES = ['Fiction', 'Science', 'History', 'Fantasy', 'Romance', 'Biography', 'Self-Help', 'Business', 'Poetry'];
const PRICE_TIERS = [299, 499, 699, 999, 1499, 1999];
const ACCENT_COLORS = ['#e8442a', '#f5b800', '#4ade80', '#7c3aed', '#0ea5e9', '#f97316', '#ec4899', '#6366f1'];
const BG_COLORS = ['#1a1040', '#0a1628', '#0f2218', '#1a0a10', '#0e1a2e', '#1a1a0a'];

interface DraftChapter {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  isPreview: boolean;
}

export default function PublishPage() {
  const router = useRouter();
  const userProfile = useAuthStore((s) => s.userProfile);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [sellerLoading, setSellerLoading] = useState(true);
  const [publishedBooksCount, setPublishedBooksCount] = useState(0);
  const [step, setStep] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [editingChapter, setEditingChapter] = useState<number | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [authorName, setAuthorName] = useState(userProfile?.firstName ? `${userProfile.firstName} ${userProfile.lastName}` : '');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [language, setLanguage] = useState('English');
  const [ageGroup, setAgeGroup] = useState<'all' | 'children' | 'teen' | 'adult'>('all');
  const [isbn, setIsbn] = useState('');
  const [copyrightBasis, setCopyrightBasis] = useState<CopyrightBasis>('original');
  const [copyrightDetails, setCopyrightDetails] = useState('');
  const [copyrightAttested, setCopyrightAttested] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [accentColor, setAccentColor] = useState(ACCENT_COLORS[0]);
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [chapters, setChapters] = useState<DraftChapter[]>([]);
  const [manuscriptFileName, setManuscriptFileName] = useState('');
  const [manuscriptFile, setManuscriptFile] = useState<File | null>(null);
  const [manuscriptImporting, setManuscriptImporting] = useState(false);
  const [manuscriptError, setManuscriptError] = useState('');
  const [price, setPrice] = useState(PRICE_TIERS[2]);
  const [customPrice, setCustomPrice] = useState('');
  const [subscriptionType, setSubscriptionType] = useState<'sell_only' | 'sell_and_sub' | 'sub_only'>('sell_only');
  const [subTiers, setSubTiers] = useState<string[]>([]);
  const [previewPct, setPreviewPct] = useState(20);
  const [publishMode, setPublishMode] = useState<'now' | 'draft' | 'preorder'>('now');
  const [releaseDate, setReleaseDate] = useState('');

  useEffect(() => {
    if (!userProfile?.uid) {
      setSellerLoading(false);
      return;
    }
    let active = true;
    Promise.all([
      getDoc(doc(db, 'sellers', userProfile.uid)),
      getSellerPublishedBooksCount(userProfile.uid),
    ]).then(([snap, bookCount]) => {
      if (!active) return;
      if (snap.exists()) setSeller(snap.data() as Seller);
      setPublishedBooksCount(bookCount);
      setSellerLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userProfile?.uid]);

  const earnings = calculateEarnings(price);

  function nextStep() { if (step < 4) setStep(step + 1); }
  function prevStep() { if (step > 0) setStep(step - 1); }

  function saveChapter(ch: Pick<Chapter, 'title' | 'content' | 'wordCount' | 'chapterNumber'>) {
    setChapters((prev) => {
      const existing = prev.findIndex((c) => c.chapterNumber === ch.chapterNumber);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], ...ch };
        return updated;
      }
      return [...prev, { ...ch, isPreview: ch.chapterNumber === 1 }].sort((a, b) => a.chapterNumber - b.chapterNumber);
    });
    setEditingChapter(null);
  }

  function toggleChapterPreview(chapterNumber: number) {
    setChapters((prev) => prev.map((c) =>
      c.chapterNumber === chapterNumber ? { ...c, isPreview: !c.isPreview } : c
    ));
  }

  async function handleManuscriptSelection(file: File | null) {
    if (!file) {
      return;
    }

    const shouldReplaceExisting =
      chapters.length === 0 ||
      window.confirm('Replace the current chapter list with the uploaded manuscript?');

    if (!shouldReplaceExisting) {
      return;
    }

    setManuscriptImporting(true);
    setManuscriptError('');

    try {
      const imported = await importManuscriptFile(file);
      setChapters(imported.chapters);
      setManuscriptFileName(imported.fileName);
      setManuscriptFile(file);
      setEditingChapter(null);
    } catch (error) {
      setManuscriptError(
        error instanceof Error ? error.message : 'We could not import that manuscript.'
      );
    } finally {
      setManuscriptImporting(false);
    }
  }

  async function handlePublish() {
    if (!userProfile) return;
    setPublishError('');
    if (!title.trim()) {
      setPublishError('Add a book title before publishing.');
      return;
    }
    if (!authorName.trim()) {
      setPublishError('Add the author name before publishing.');
      return;
    }
    if (!genre.trim()) {
      setPublishError('Choose a genre before publishing.');
      return;
    }
    if (chapters.length === 0) {
      setPublishError('Add at least one chapter or import a manuscript before publishing.');
      return;
    }
    if (!copyrightAttested) {
      setPublishError('Confirm that you own the rights or are legally allowed to publish this book.');
      return;
    }
    if (requiresManualCopyrightReview(copyrightBasis) && !copyrightDetails.trim()) {
      setPublishError('Add copyright or licensing details so the review team can verify this book.');
      return;
    }
    if (publishMode !== 'draft' && requiresIdVerificationForPublishingNow) {
      setPublishError(
        `You have reached the ${SELLER_BOOKS_BEFORE_ID_VERIFICATION}-book grace limit. Submit ID verification before publishing another live title or pre-order.`
      );
      return;
    }
    setPublishing(true);
    try {
      const settings = await getPlatformSettings();
      const shouldCreatePublicListing = publishMode !== 'draft';
      const requiresRightsReview = requiresManualCopyrightReview(copyrightBasis);
      const nextBookStatus =
        shouldCreatePublicListing
          ? ((settings.autoApproveBooks && !requiresRightsReview) ? 'live' : 'in_review')
          : 'draft';

      // Create book document
      const bookRef = await addDoc(collection(db, 'books'), {
        sellerId: userProfile.uid,
        sellerName: `${userProfile.firstName} ${userProfile.lastName}`,
        sellerHandle: userProfile.username,
        sellerVerified: seller?.isVerified ?? false,
        title,
        authorName,
        description,
        coverUrl: '',
        coverBgColor: bgColor,
        coverAccentColor: accentColor,
        genre,
        language,
        targetAgeGroup: ageGroup,
        isbn: isbn || null,
        price,
        status: nextBookStatus,
        isFeatured: false,
        inSubscription: subscriptionType !== 'sell_only',
        subscriptionTiers: subTiers,
        subscriptionOptInType: subscriptionType,
        subscriptionEligibleFrom: null,
        previewPercentage: previewPct,
        totalSales: 0,
        totalBorrows: 0,
        averageRating: 0,
        reviewCount: 0,
        publishedAt: shouldCreatePublicListing ? serverTimestamp() : null,
        isPreorder: publishMode === 'preorder',
        releaseDate: publishMode === 'preorder' && releaseDate ? new Date(releaseDate) : null,
        flagReason: null,
        flagCount: 0,
        readTime: chapters.length > 0 ? `${Math.ceil(chapters.reduce((s, c) => s + c.wordCount, 0) / 250 / 60)}h` : '1h',
        wordCount: chapters.reduce((s, c) => s + c.wordCount, 0),
        chapterCount: chapters.length,
        tags: [genre.toLowerCase()],
        copyrightBasis,
        copyrightDetails: copyrightDetails.trim() || null,
        copyrightAttestationAccepted: copyrightAttested,
        copyrightReviewStatus: shouldCreatePublicListing
          ? (requiresRightsReview || !settings.autoApproveBooks ? 'pending' : 'approved')
          : 'not_needed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Upload cover and manuscript if provided
      const { updateDoc } = await import('firebase/firestore');
      const storageUpdates: Record<string, string> = {};

      if (coverFile) {
        storageUpdates.coverUrl = await uploadCoverImage(userProfile.uid, bookRef.id, coverFile);
      }
      if (manuscriptFile) {
        storageUpdates.manuscriptUrl = await uploadManuscript(userProfile.uid, bookRef.id, manuscriptFile);
      }
      if (Object.keys(storageUpdates).length > 0) {
        await updateDoc(doc(db, 'books', bookRef.id), storageUpdates);
      }

      // Save chapters as subcollection
      for (const ch of chapters) {
        await addDoc(collection(db, 'books', bookRef.id, 'chapters'), {
          bookId: bookRef.id,
          chapterNumber: ch.chapterNumber,
          title: ch.title,
          content: ch.content,
          wordCount: ch.wordCount,
          isPreview: ch.isPreview ?? ch.chapterNumber === 1,
          isLocked: !(ch.isPreview ?? ch.chapterNumber === 1),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (publishMode !== 'draft') {
        const { setDoc } = await import('firebase/firestore');
        const nextVerificationStatus = {
          ...DEFAULT_SELLER_VERIFICATION_STATUS,
          ...(seller?.verificationStatus ?? {}),
          emailVerified: seller?.verificationStatus?.emailVerified ?? true,
          bioAdded: (userProfile.bio?.trim().length ?? 0) >= 50,
          firstBookPublished: true,
          tenSalesReached: (seller?.totalSales ?? 0) >= 10,
        };
        await setDoc(
          doc(db, 'sellers', userProfile.uid),
          {
            verificationStatus: nextVerificationStatus,
            isVerified: hasCompletedSellerVerification(nextVerificationStatus),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      const resultParams = new URLSearchParams({
        published: nextBookStatus,
        mode: publishMode,
      });
      if (shouldCreatePublicListing && requiresRightsReview) {
        resultParams.set('review', 'copyright');
      }
      router.push(`/listings?${resultParams.toString()}`);
    } catch (err) {
      console.error('Publish error:', err);
      setPublishError(
        err instanceof Error && err.message
          ? err.message
          : 'We could not publish this book. Please try again.'
      );
    } finally {
      setPublishing(false);
    }
  }

  const checklist = [
    { label: 'Title added', done: !!title },
    { label: 'Description added', done: !!description },
    { label: 'Genre selected', done: !!genre },
    { label: 'Cover configured', done: !!accentColor },
    { label: 'Book content added', done: chapters.length > 0 },
    { label: 'Price set', done: price > 0 },
    { label: 'Author name set', done: !!authorName },
    { label: 'Rights confirmed', done: copyrightAttested },
    { label: 'Rights review notes added', done: !requiresManualCopyrightReview(copyrightBasis) || !!copyrightDetails.trim() },
  ];
  const idVerified = seller?.verificationStatus?.idVerified ?? false;
  const booksRemainingBeforeVerification = getRemainingGraceBooksBeforeIdVerification(publishedBooksCount);
  const requiresIdVerificationForPublishingNow = requiresSellerIdVerificationForPublishing(
    publishedBooksCount,
    idVerified
  );
  const publishActionBlocked = publishMode !== 'draft' && requiresIdVerificationForPublishingNow;

  if (sellerLoading) return (
    <div className="min-h-screen bg-[#0e0e0e]"><SellerHeader />
      <div className="flex justify-center pt-16"><LoadingSpinner size={32} /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6 xl:flex-row xl:gap-8">

        {/* Main form */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Steps bar */}
          <div className="-mx-1 flex items-center gap-0 overflow-x-auto px-1 pb-1">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={s} className="flex flex-shrink-0 items-center">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: done || active ? '#e8442a' : '#1a1a1a', color: done || active ? '#fff' : '#555' }}
                    >
                      {done ? <Check size={12} /> : i + 1}
                    </div>
                    <span className="text-xs" style={{ color: active ? '#f5f2eb' : '#555' }}>{s}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="mx-2 h-px w-8" style={{ background: done ? '#e8442a' : '#222' }} />
                  )}
                </div>
              );
            })}
          </div>

          {!idVerified && (
            <div
              className="p-4 rounded-xl border flex items-start justify-between gap-4"
              style={{
                background: requiresIdVerificationForPublishingNow ? '#2e1a0f' : '#0f172a',
                borderColor: requiresIdVerificationForPublishingNow ? '#5b3a0a' : '#1e293b',
              }}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldAlert
                    size={16}
                    style={{ color: requiresIdVerificationForPublishingNow ? '#f5b800' : '#93c5fd' }}
                  />
                  <p
                    className="text-sm font-medium"
                    style={{ color: requiresIdVerificationForPublishingNow ? '#f5b800' : '#dbeafe' }}
                  >
                    {requiresIdVerificationForPublishingNow
                      ? 'ID verification is now required'
                      : booksRemainingBeforeVerification === 1
                        ? 'You can publish 1 more book before ID verification'
                        : 'New author grace period'}
                  </p>
                </div>
                <p className="text-xs text-[#94a3b8]">
                  {requiresIdVerificationForPublishingNow
                    ? `You have already published ${SELLER_BOOKS_BEFORE_ID_VERIFICATION} books. Submit ID verification before publishing another live title or pre-order. Drafts still work.`
                    : `You can publish your first ${SELLER_BOOKS_BEFORE_ID_VERIFICATION} books before we ask for ID verification.`}
                </p>
              </div>
              <Link
                href="/seller/profile/verification"
                className="px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap"
                style={{ background: '#e8442a', color: '#fff' }}
              >
                Verification
              </Link>
            </div>
          )}

          {/* Step content */}
          <div className="p-4 rounded-xl border sm:p-6" style={{ background: '#111', borderColor: '#1a1a1a' }}>

            {/* Step 1: Details */}
            {step === 0 && (
              <div className="space-y-4">
                <h2 className="font-display text-display-sm text-white">Book Details</h2>
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">Book Title</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter book title" className="w-full px-3.5 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">Author Name</label>
                  <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Tell readers what your book is about..." className="w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-2">Genre</label>
                  <div className="flex flex-wrap gap-2">
                    {GENRES.map((g) => (
                      <button key={g} type="button" onClick={() => setGenre(g)}
                        className="px-3 py-1.5 rounded-lg text-sm transition-all"
                        style={{ background: genre === g ? '#e8442a' : '#1a1a1a', color: genre === g ? '#fff' : '#888', border: `1px solid ${genre === g ? '#e8442a' : '#333'}` }}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm text-[#aaa] mb-1.5">Language</label>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
                      {['English', 'French', 'Swahili', 'Yoruba', 'Amharic', 'Arabic', 'Portuguese'].map((l) => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-[#aaa] mb-1.5">Target Age</label>
                    <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value as typeof ageGroup)} className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
                      {['all', 'children', 'teen', 'adult'].map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">ISBN (optional)</label>
                  <input value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978-..." className="w-full px-3.5 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <div className="space-y-3 rounded-xl border p-4" style={{ background: '#151515', borderColor: '#252525' }}>
                  <div>
                    <p className="text-sm font-medium text-white">Publishing Rights</p>
                    <p className="mt-1 text-xs text-[#666]">Tell the platform why you are legally allowed to publish this book.</p>
                  </div>
                  <div className="space-y-2">
                    {COPYRIGHT_BASIS_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all"
                        style={{
                          border: copyrightBasis === option.value ? '1.5px solid #e8442a' : '1.5px solid #2a2a2a',
                          background: copyrightBasis === option.value ? '#1f0e0c' : '#1a1a1a',
                        }}
                      >
                        <input
                          type="radio"
                          name="copyrightBasis"
                          value={option.value}
                          checked={copyrightBasis === option.value}
                          onChange={() => setCopyrightBasis(option.value)}
                          className="mt-0.5 accent-[#e8442a]"
                        />
                        <div>
                          <p className="text-sm font-medium text-white">{option.label}</p>
                          <p className="text-xs text-[#666]">{option.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-sm text-[#aaa] mb-1.5">
                      Rights details {requiresManualCopyrightReview(copyrightBasis) ? '(required)' : '(optional)'}
                    </label>
                    <textarea
                      value={copyrightDetails}
                      onChange={(e) => setCopyrightDetails(e.target.value)}
                      rows={3}
                      placeholder="Add license, source, assignment, or public-domain details for the review team."
                      className="w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none"
                      style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}
                    />
                  </div>
                  <label className="flex items-start gap-3 rounded-xl border p-3" style={{ background: '#111', borderColor: '#2a2a2a' }}>
                    <input
                      type="checkbox"
                      checked={copyrightAttested}
                      onChange={(e) => setCopyrightAttested(e.target.checked)}
                      className="mt-1 accent-[#e8442a]"
                    />
                    <span className="text-sm text-[#aaa]">
                      I confirm that I own the rights to this book or I have explicit permission to publish it on AfroBooks.
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Step 2: Cover */}
            {step === 1 && (
              <div className="space-y-5">
                <h2 className="font-display text-display-sm text-white">Cover Design</h2>
                <div>
                  <label className="block text-sm text-[#aaa] mb-2">Upload Cover Image (optional)</label>
                  <label
                    className="flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
                    style={{ borderColor: coverFile ? '#4ade80' : '#333', background: '#1a1a1a' }}
                  >
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
                    <p className="text-sm text-[#666]">{coverFile ? coverFile.name : 'Click to upload cover image'}</p>
                    {coverFile && <p className="text-xs mt-1" style={{ color: '#4ade80' }}>Uploaded</p>}
                  </label>
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-2">Accent Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {ACCENT_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setAccentColor(c)}
                        className="w-8 h-8 rounded-full border-2 transition-all"
                        style={{ background: c, borderColor: accentColor === c ? '#fff' : 'transparent' }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-2">Background Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {BG_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setBgColor(c)}
                        className="w-8 h-8 rounded-full border-2 transition-all"
                        style={{ background: c, borderColor: bgColor === c ? '#fff' : '#444' }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Chapters */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="font-display text-display-sm text-white">Book Content</h2>
                <div
                  className="rounded-xl border p-4"
                  style={{ background: '#161616', borderColor: '#2a2a2a' }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-white">Upload full book manuscript</p>
                      <p className="text-xs text-[#777]">
                        Drop in the whole book as a `.txt` or `.md` file. The app will import the full manuscript and turn it into publishable reading content.
                      </p>
                      <p className="text-xs text-[#555]">
                        Use headings like `Chapter 1: Opening` or `## Chapter title` to split the book automatically. If there are no headings, the entire upload is still imported as one complete reading section.
                      </p>
                    </div>
                    <label
                      className="inline-flex cursor-pointer items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium"
                      style={{ background: '#e8442a', color: '#fff' }}
                    >
                      <input
                        type="file"
                        accept=".txt,.md,.markdown,text/plain,text/markdown"
                        className="hidden"
                        onChange={(event) => {
                          const selectedFile = event.target.files?.[0] ?? null;
                          void handleManuscriptSelection(selectedFile);
                          event.currentTarget.value = '';
                        }}
                      />
                      {manuscriptImporting ? 'Importing…' : 'Upload manuscript'}
                    </label>
                  </div>

                  {manuscriptFileName && (
                    <p className="mt-3 text-xs text-[#4ade80]">
                      Imported the full manuscript `{manuscriptFileName}` into {chapters.length} reading section{chapters.length === 1 ? '' : 's'}.
                    </p>
                  )}
                  {manuscriptError && (
                    <p className="mt-3 text-xs text-[#f5b800]">{manuscriptError}</p>
                  )}
                </div>

                <div className="rounded-xl border p-4" style={{ background: '#131313', borderColor: '#232323' }}>
                  <p className="text-sm font-medium text-white">Manual editing stays available</p>
                  <p className="mt-1 text-xs text-[#666]">
                    After uploading the full book, you can still edit titles, preview access, and chapter content below before publishing.
                  </p>
                </div>

                {chapters.map((ch) => (
                  <div key={ch.chapterNumber} className="flex items-center justify-between p-3 rounded-lg border" style={{ background: '#1a1a1a', borderColor: '#2a2a2a' }}>
                    <div>
                      <span className="text-sm font-medium text-white">Ch. {ch.chapterNumber}: {ch.title}</span>
                      <span className="ml-3 text-xs text-[#555]">{ch.wordCount} words</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => toggleChapterPreview(ch.chapterNumber)}
                        className="text-xs px-2 py-0.5 rounded transition-colors"
                        style={{ background: ch.isPreview ? '#0f2e1a' : '#1a1a2e', color: ch.isPreview ? '#4ade80' : '#555' }}>
                        {ch.isPreview ? 'FREE PREVIEW' : 'LOCKED'}
                      </button>
                      <button type="button" onClick={() => setEditingChapter(ch.chapterNumber)} className="text-xs text-[#e8442a]">Edit</button>
                    </div>
                  </div>
                ))}

                {editingChapter !== null ? (
                  <ChapterEditor
                    chapterNumber={editingChapter}
                    onSave={saveChapter}
                    onCancel={() => setEditingChapter(null)}
                    initial={chapters.find((c) => c.chapterNumber === editingChapter)}
                  />
                ) : (
                  <button type="button" onClick={() => setEditingChapter(chapters.length + 1)}
                    className="w-full py-3 rounded-xl border-2 border-dashed text-sm transition-colors"
                    style={{ borderColor: '#333', color: '#666' }}>
                    + Add Chapter
                  </button>
                )}
              </div>
            )}

            {/* Step 4: Pricing */}
            {step === 3 && (
              <div className="space-y-5">
                <h2 className="font-display text-display-sm text-white">Pricing</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {PRICE_TIERS.map((p) => (
                    <button key={p} type="button" onClick={() => setPrice(p)}
                      className="p-3 rounded-xl border text-center transition-all"
                      style={{ border: price === p ? '1.5px solid #f5b800' : '1.5px solid #2a2a2a', background: price === p ? '#1a1500' : '#111' }}>
                      <p className="font-display text-xl" style={{ color: price === p ? '#f5b800' : '#f5f2eb' }}>${(p / 100).toFixed(2)}</p>
                    </button>
                  ))}
                </div>

                {/* Earnings breakdown */}
                <div className="p-4 rounded-xl border" style={{ background: '#1a1a1a', borderColor: '#2a2a2a' }}>
                  <p className="text-sm font-medium text-white mb-3">Earnings Breakdown</p>
                  {[
                    { label: 'List Price', value: `$${(price / 100).toFixed(2)}`, color: '#f5f2eb' },
                    { label: 'AfroBooks fee (15%)', value: `-${earnings.platformFeeDisplay}`, color: '#e8442a' },
                    { label: 'Stripe fee (2.9% + $0.30)', value: `-${earnings.stripeFeeDisplay}`, color: '#f5b800' },
                    { label: 'Your earnings', value: earnings.sellerEarningsDisplay, color: '#4ade80' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between text-sm py-1">
                      <span className="text-[#888]">{label}</span>
                      <span style={{ color }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Subscription opt-in */}
                <div>
                  <p className="text-sm font-medium text-white mb-3">Subscription Opt-In</p>
                  <div className="space-y-2">
                    {[
                      { value: 'sell_only', label: 'Sell Only', desc: 'Readers must purchase to access.' },
                      { value: 'sell_and_sub', label: 'Sell + Subscription', desc: 'Available for both purchase and subscription.' },
                      { value: 'sub_only', label: 'Subscription Only', desc: 'Only accessible to subscribers.' },
                    ].map(({ value, label, desc }) => (
                      <label key={value} className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                        style={{ border: subscriptionType === value ? '1.5px solid #e8442a' : '1.5px solid #2a2a2a', background: subscriptionType === value ? '#1f0e0c' : '#1a1a1a' }}>
                        <input type="radio" name="subType" value={value} checked={subscriptionType === value} onChange={() => setSubscriptionType(value as typeof subscriptionType)} className="mt-0.5 accent-[#e8442a]" />
                        <div>
                          <p className="text-sm font-medium text-white">{label}</p>
                          <p className="text-xs text-[#666]">{desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Preview length */}
                <div>
                  <p className="text-sm font-medium text-white mb-2">Free Preview Length</p>
                  <div className="flex gap-2">
                    {[10, 20, 30, 50].map((p) => (
                      <button key={p} type="button" onClick={() => setPreviewPct(p)}
                        className="flex-1 py-2 rounded-lg text-sm transition-all"
                        style={{ background: previewPct === p ? '#e8442a' : '#1a1a1a', color: previewPct === p ? '#fff' : '#888', border: `1px solid ${previewPct === p ? '#e8442a' : '#333'}` }}>
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Publish */}
            {step === 4 && (
              <div className="space-y-5">
                <h2 className="font-display text-display-sm text-white">Pre-Publish Checklist</h2>
                <div className="space-y-2">
                  {checklist.map(({ label, done }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: done ? '#0f2e1a' : '#1a1a1a', border: `1.5px solid ${done ? '#4ade80' : '#333'}` }}>
                        {done && <Check size={10} style={{ color: '#4ade80' }} />}
                      </div>
                      <span className="text-sm" style={{ color: done ? '#f5f2eb' : '#555' }}>{label}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-sm font-medium text-white mb-2">Publishing Options</p>
                  <div className="space-y-2">
                    {[
                      { value: 'now', label: 'Publish immediately', desc: 'Goes live right away (or enters review).' },
                      { value: 'preorder', label: 'Set as pre-order', desc: 'Readers can purchase now and unlock access on release date.' },
                      { value: 'draft', label: 'Save as draft', desc: 'Not visible to readers yet.' },
                    ].map(({ value, label, desc }) => (
                      <label key={value} className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                        style={{ border: publishMode === value ? '1.5px solid #4ade80' : '1.5px solid #2a2a2a', background: publishMode === value ? '#0a1f0a' : '#1a1a1a' }}>
                        <input type="radio" name="publishMode" value={value} checked={publishMode === value}
                          onChange={() => setPublishMode(value as typeof publishMode)} className="mt-0.5 accent-[#4ade80]" />
                        <div>
                          <p className="text-sm font-medium text-white">{label}</p>
                          <p className="text-xs text-[#666]">{desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {publishMode === 'preorder' && (
                    <div className="mt-3">
                      <label className="block text-sm text-[#aaa] mb-1.5">Release Date</label>
                      <input type="date" title="Release date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-3.5 py-2.5 rounded-lg border text-sm"
                        style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                    </div>
                  )}
                </div>

                <div className="rounded-xl border p-4" style={{ background: '#151515', borderColor: '#252525' }}>
                  <p className="text-sm font-medium text-white">Copyright review</p>
                  <p className="mt-1 text-xs text-[#666]">
                    Rights basis: {getCopyrightBasisLabel(copyrightBasis)}.
                    {requiresManualCopyrightReview(copyrightBasis)
                      ? ' This book will stay in review until the team verifies the rights details you provided.'
                      : ' Original works can go live automatically when other platform checks pass.'}
                  </p>
                </div>

                <button type="button" onClick={handlePublish}
                  disabled={publishing || (publishMode === 'preorder' && !releaseDate) || publishActionBlocked}
                  className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: '#4ade80', color: '#000' }}>
                  {publishing ? <LoadingSpinner size={16} color="#000" /> : <Check size={16} />}
                  {publishMode === 'now' ? 'Publish Ebook Now' : publishMode === 'preorder' ? 'Set Pre-order' : 'Save as Draft'}
                </button>
                {(publishActionBlocked || publishError) && (
                  <p className="text-xs text-center" style={{ color: '#f5b800' }}>
                    {publishError || 'ID verification is required before publishing another live title or pre-order. You can still save drafts.'}
                  </p>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-5 mt-5 border-t" style={{ borderColor: '#1a1a1a' }}>
              <button type="button" onClick={prevStep} disabled={step === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border disabled:opacity-30"
                style={{ borderColor: '#333', color: '#aaa' }}>
                <ArrowLeft size={14} /> Back
              </button>
              {step < 4 && (
                <button type="button" onClick={nextStep}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#e8442a', color: '#fff' }}>
                  Next <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div className="w-full xl:w-72 xl:flex-shrink-0">
          <div className="rounded-xl border p-4 xl:sticky xl:top-20" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-xs text-[#555] uppercase tracking-wider mb-3">Live Preview</p>

            {/* Mini cover */}
            <div className="rounded-xl overflow-hidden mb-3 relative" style={{ height: 160, background: bgColor }}>
              <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: accentColor }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85))' }} />
              <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#f5b800', color: '#000', fontSize: 8 }}>EBOOK</span>
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <p className="text-xs uppercase tracking-wider" style={{ color: accentColor, fontSize: 9 }}>{genre || 'Genre'}</p>
                <p className="font-display text-white leading-tight" style={{ fontSize: 14 }}>{title || 'Book Title'}</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>{authorName || 'Author'}</p>
              </div>
            </div>

            <p className="font-display text-lg text-white">{title || 'Untitled Book'}</p>
            <p className="text-sm text-[#666] mb-3">{authorName}</p>

            <div className="space-y-1.5 text-xs text-[#555]">
              <div className="flex justify-between">
                <span>Chapters</span>
                <span className="text-[#aaa]">{chapters.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Earnings/sale</span>
                <span style={{ color: '#4ade80' }}>{earnings.sellerEarningsDisplay}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span style={{ color: '#f5b800' }}>{publishMode === 'now' ? 'Publishing' : publishMode === 'preorder' ? 'Pre-order' : 'Draft'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
