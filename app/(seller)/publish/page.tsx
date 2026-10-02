'use client';

import { authenticatedPost } from '@/lib/firebase/request';

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePublicationDraft } from '@/hooks/usePublicationDraft';
import { publicationDraftKey, type PublicationDraft } from '@/lib/publishing/localDrafts';
import { useConnectionRecovery } from '@/hooks/useConnectionRecovery';
import { appFetch } from '@/lib/network';
import Link from 'next/link';
import { Check, ArrowLeft, ArrowRight } from 'lucide-react';
import SellerHeader from '@/components/seller/SellerHeader';
import ChapterEditor from '@/components/seller/ChapterEditor';
import ManuscriptUpload from '@/components/seller/ManuscriptUpload';
import ReadingSectionSplitter from '@/components/seller/ReadingSectionSplitter';
import ChapterPreviewSummary from '@/components/seller/ChapterPreviewSummary';
import BookPricing from '@/components/seller/BookPricing';
import { useAuthStore } from '@/store/authStore';
import { uploadCoverImage, uploadManuscript, uploadMagazinePdf } from '@/lib/firebase/storage';
import { db } from '@/lib/firebase/config';
import { collection, doc, getDoc, getDocs, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { calculateEarnings } from '@/lib/utils/calculateEarnings';
import { minimumPublicationPrice } from '@/lib/utils/fees';
import { getSellerPublishedBooksCount } from '@/lib/firebase/firestore';
import {
  DEFAULT_SELLER_VERIFICATION_STATUS,
  SELLER_BOOKS_BEFORE_ID_VERIFICATION,
  getRemainingGraceBooksBeforeIdVerification,
  hasCompletedSellerVerification,
  requiresSellerIdVerificationForPublishing,
} from '@/lib/sellerVerification';
import type { Chapter, PublicationType } from '@/types/book';
import type { CopyrightBasis } from '@/types/book';
import type { Seller } from '@/types/user';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { ShieldAlert } from 'lucide-react';
import { COPYRIGHT_BASIS_OPTIONS, getCopyrightBasisLabel, requiresManualCopyrightReview } from '@/lib/utils/copyright';

const STEPS = ['Details', 'Cover', 'Book Content', 'Pricing', 'Publish'];
const GENRES = ['Fiction', 'Science', 'History', 'Fantasy', 'Romance', 'Biography', 'Self-Help', 'Business', 'Poetry'];
const ACCENT_COLORS = ['#e8442a', '#f5b800', '#4ade80', '#7c3aed', '#0ea5e9', '#f97316', '#ec4899', '#6366f1'];
const BG_COLORS = ['#1a1040', '#0a1628', '#0f2218', '#1a0a10', '#0e1a2e', '#1a1a0a'];

interface DraftChapter {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  isPreview: boolean;
}

function PublishWorkspace({ editId, resetDraft }: { editId: string | null; resetDraft: () => void }) {
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
  const [publicationType, setPublicationType] = useState<PublicationType>('book');
  const [issueLabel, setIssueLabel] = useState('');
  const [contentFormat, setContentFormat] = useState<'text' | 'pdf'>('text');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const isPdf = publicationType === 'magazine' && contentFormat === 'pdf';
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
  const [price, setPrice] = useState(699);
  const [pricingValid, setPricingValid] = useState(true);
  const subscriptionType: 'sell_only' | 'sell_and_sub' | 'sub_only' = 'sell_only';
  const subTiers: string[] = [];
  const [directSaleFee, setDirectSaleFee] = useState<number | null>(null);
  const [pricingError, setPricingError] = useState('');
  const [publishMode, setPublishMode] = useState<'now' | 'draft' | 'preorder'>('now');
  const [releaseDate, setReleaseDate] = useState('');
  const savedBookId = useRef<string | null>(null);
  const [draftBookId, setDraftBookId] = useState<string | null>(null);
  const [editingBook, setEditingBook] = useState(false);
  const [editLoading, setEditLoading] = useState(true);
  const [editorDraft, setEditorDraft] = useState<PublicationDraft['editorDraft']>(null);
  const [retry, setRetry] = useState(0);
  const publishBusy = useRef(false);
  const [discardingDraft, setDiscardingDraft] = useState(false);
  useConnectionRecovery(() => setRetry(value => value + 1));

  const draftValue = useMemo<PublicationDraft>(() => ({
    title, authorName, description, genre, language, publicationType, issueLabel, contentFormat,
    ageGroup, isbn, copyrightBasis, copyrightDetails, copyrightAttested, accentColor, bgColor, chapters,
    manuscriptFileName, manuscriptFile, pdfFile, pdfPageCount, coverFile, price, publishMode, releaseDate,
    step, editorDraft, editingChapter, savedBookId: draftBookId,
  }), [title, authorName, description, genre, language, publicationType, issueLabel, contentFormat,
    ageGroup, isbn, copyrightBasis, copyrightDetails, copyrightAttested, accentColor, bgColor, chapters,
    manuscriptFileName, manuscriptFile, pdfFile, pdfPageCount, coverFile, price, publishMode, releaseDate, step, editorDraft, editingChapter, draftBookId]);
  const localDraft = usePublicationDraft(userProfile?.uid ? publicationDraftKey(userProfile.uid, editId) : null,
    !editLoading, draftValue, draft => {
      setTitle(draft.title); setAuthorName(draft.authorName); setDescription(draft.description);
      setGenre(draft.genre); setLanguage(draft.language); setPublicationType(draft.publicationType);
      setIssueLabel(draft.issueLabel); setContentFormat(draft.contentFormat); setAgeGroup(draft.ageGroup);
      setIsbn(draft.isbn); setCopyrightBasis(draft.copyrightBasis); setCopyrightDetails(draft.copyrightDetails);
      setCopyrightAttested(draft.copyrightAttested); setAccentColor(draft.accentColor); setBgColor(draft.bgColor);
      setChapters(draft.chapters); setManuscriptFileName(draft.manuscriptFileName); setManuscriptFile(draft.manuscriptFile);
      setPdfFile(draft.pdfFile); setPdfPageCount(draft.pdfPageCount); setCoverFile(draft.coverFile);
      setPrice(draft.price); setPublishMode(draft.publishMode); setReleaseDate(draft.releaseDate); setStep(draft.step);
      setEditorDraft(draft.editorDraft); setEditingChapter(draft.editingChapter);
      savedBookId.current = editId ?? draft.savedBookId;
      setDraftBookId(savedBookId.current);
      setEditingBook(!!editId);
    });

  useEffect(() => {
    let active = true;
    appFetch('/api/platform/public', { cache: 'no-store' }).then(response => response.json()).then(settings => {
      if (settings.pricingAvailable === false || !Number.isFinite(settings.directSaleFee) || settings.directSaleFee < 0 || settings.directSaleFee > 100) throw new Error('Invalid pricing settings');
      if (active) { setDirectSaleFee(settings.directSaleFee); setPricingError(''); }
    }).catch(() => { if (active) setPricingError('Unable to load the current commission. Reconnect and retry before setting your price.'); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!userProfile?.uid) return;
    if (!editId) { setEditLoading(false); return; }
    if (savedBookId.current) return;
    let active = true;
    Promise.all([getDoc(doc(db, 'books', editId)), getDocs(collection(db, 'books', editId, 'chapters'))]).then(([snapshot, items]) => {
      if (!active) return;
      const book = snapshot.data();
      if (!book || book.sellerId !== userProfile.uid) throw new Error('This book is not in your listings.');
      savedBookId.current = editId;
      setDraftBookId(editId);
      setEditingBook(true);
      setTitle(book.title ?? ''); setAuthorName(book.authorName ?? ''); setDescription(book.description ?? '');
      setPublicationType(book.publicationType === 'magazine' ? 'magazine' : book.publicationType === 'short_story' ? 'short_story' : 'book'); setIssueLabel(book.issueLabel ?? '');
      setContentFormat(book.contentFormat === 'pdf' ? 'pdf' : 'text'); setPdfPageCount(book.pdfPageCount ?? 0);
      setGenre(book.genre ?? ''); setLanguage(book.language ?? 'English'); setAgeGroup(book.targetAgeGroup ?? 'all');
      setIsbn(book.isbn ?? ''); setPrice(book.price ?? 699); setBgColor(book.coverBgColor ?? BG_COLORS[0]);
      setAccentColor(book.coverAccentColor ?? ACCENT_COLORS[0]); setCopyrightBasis(book.copyrightBasis ?? 'original');
      setCopyrightDetails(book.copyrightDetails ?? ''); setCopyrightAttested(book.copyrightAttestationAccepted === true);
      setChapters(items.docs.map(item => item.data() as DraftChapter).sort((a,b) => a.chapterNumber-b.chapterNumber));
    }).catch(error => { if (active) setPublishError(error.message ?? 'Unable to load this book.'); })
      .finally(() => { if (active) setEditLoading(false); });
    return () => { active = false; };
  }, [userProfile?.uid, editId, retry]);

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
    }).catch(() => { if (active) { setPublishError('Unable to check your author verification. Please reload to retry.'); setSellerLoading(false); } });
    return () => {
      active = false;
    };
  }, [userProfile?.uid, retry]);

  const earnings = directSaleFee === null ? null : calculateEarnings(Number.isSafeInteger(price) && price >= 0 ? price : 0, directSaleFee);

  function nextStep() { if (step < 4) setStep(step + 1); }
  function prevStep() {
    // Leaving Pricing discards an unfinished input; the last valid price stays.
    if (step === 3) setPricingValid(true);
    if (step > 0) setStep(step - 1);
  }

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
    setEditorDraft(null);
  }

  function toggleChapterPreview(chapterNumber: number) {
    setChapters((prev) => prev.map((c) =>
      c.chapterNumber === chapterNumber ? { ...c, isPreview: !c.isPreview } : c
    ));
  }

  async function handlePublish() {
    if (!userProfile || editLoading || manuscriptImporting || publishBusy.current) return;
    if (editorDraft) { setPublishError('Save or cancel the chapter you are editing before publishing.'); setStep(2); return; }
    if (new URL(window.location.href).searchParams.has('edit') && !savedBookId.current) return;
    setPublishError('');
    if (!pricingValid || directSaleFee === null || !Number.isSafeInteger(price) || price < minimumPublicationPrice(publicationType) || price > 99999999) {
      setPublishError('Review the book price in Pricing before saving.');
      return;
    }
    if (!title.trim()) {
      setPublishError('Add a book title before publishing.');
      return;
    }
    if (publishMode !== 'draft' && !authorName.trim()) {
      setPublishError('Add the author name before publishing.');
      return;
    }
    if (publishMode !== 'draft' && !genre.trim()) {
      setPublishError('Choose a genre before publishing.');
      return;
    }
    if (publishMode !== 'draft' && (isPdf ? !pdfFile && !pdfPageCount : chapters.length === 0)) {
      setPublishError(isPdf ? 'Choose a magazine PDF before publishing.' : 'Add at least one chapter or import a manuscript before publishing.');
      return;
    }
    if (publishMode !== 'draft' && !copyrightAttested) {
      setPublishError('Confirm that you own the rights or are legally allowed to publish this book.');
      return;
    }
    if (publishMode !== 'draft' && requiresManualCopyrightReview(copyrightBasis) && !copyrightDetails.trim()) {
      setPublishError('Add copyright or licensing details so the review team can verify this book.');
      return;
    }
    if (publishMode !== 'draft' && requiresIdVerificationForPublishingNow) {
      setPublishError(
        `You have reached the ${SELLER_BOOKS_BEFORE_ID_VERIFICATION}-book grace limit. Submit ID verification before publishing another live title or pre-order.`
      );
      return;
    }
    publishBusy.current = true;
    setPublishing(true);
    try {
      const shouldCreatePublicListing = publishMode !== 'draft';
      const requiresRightsReview = requiresManualCopyrightReview(copyrightBasis);
      let nextBookStatus = 'draft';

      // Create book document
      const bookRef = savedBookId.current ? doc(db, 'books', savedBookId.current) : doc(collection(db, 'books'));
      const existingBook = savedBookId.current ? await getDoc(bookRef) : null;
      if (editId && !existingBook?.exists()) throw new Error('This book was deleted. Return to your books to create a new draft.');
      if (existingBook?.exists()) await authenticatedPost(`/api/books/${bookRef.id}/draft`, {});
      savedBookId.current = bookRef.id;
      setDraftBookId(bookRef.id);
      // Retain the same book ID if the upload is interrupted after creation.
      await localDraft.flush({ ...draftValue, savedBookId: bookRef.id }).catch(() => {});
      await setDoc(bookRef, {
        sellerId: userProfile.uid,
        sellerName: `${userProfile.firstName} ${userProfile.lastName}`,
        sellerHandle: userProfile.username,
        sellerVerified: seller?.isVerified ?? false,
        title,
        authorName,
        publicationType,
        contentFormat: isPdf ? 'pdf' : 'text',
        issueLabel: publicationType === 'magazine' ? issueLabel.trim() || null : null,
        description,
        coverUrl: existingBook?.data()?.coverUrl ?? '',
        coverBgColor: bgColor,
        coverAccentColor: accentColor,
        genre,
        language,
        targetAgeGroup: ageGroup,
        isbn: isbn || null,
        price,
        status: nextBookStatus,
        isFeatured: existingBook?.data()?.isFeatured ?? false,
        inSubscription: false,
        subscriptionTiers: subTiers,
        subscriptionOptInType: subscriptionType,
        subscriptionEligibleFrom: null,
        totalSales: existingBook?.data()?.totalSales ?? 0,
        totalBorrows: existingBook?.data()?.totalBorrows ?? 0,
        averageRating: existingBook?.data()?.averageRating ?? 0,
        reviewCount: existingBook?.data()?.reviewCount ?? 0,
        publishedAt: null,
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
        copyrightReviewStatus: 'not_needed',
        createdAt: existingBook?.data()?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Upload cover and manuscript if provided
      const { updateDoc } = await import('firebase/firestore');
      const storageUpdates: Record<string, string> = {};

      if (coverFile) {
        storageUpdates.coverUrl = await uploadCoverImage(userProfile.uid, bookRef.id, coverFile);
      }
      if (manuscriptFile) {
        const manuscriptPath = await uploadManuscript(userProfile.uid, bookRef.id, manuscriptFile);
        await setDoc(doc(db, 'privateBooks', bookRef.id), { sellerId: userProfile.uid, manuscriptPath }, { merge: true });
      }
      if (Object.keys(storageUpdates).length > 0) {
        await updateDoc(doc(db, 'books', bookRef.id), storageUpdates);
      }

      if (isPdf && pdfFile) {
        const path = await uploadMagazinePdf(userProfile.uid, bookRef.id, pdfFile);
        const verified = await authenticatedPost<{ pageCount: number }>(`/api/books/${bookRef.id}/pdf`, { path });
        setPdfPageCount(verified.pageCount);
        setPdfFile(null);
      }

      // Save chapters as subcollection
      const oldChapters = await getDocs(collection(db, 'books', bookRef.id, 'chapters'));
      // Keep chunks below Firestore's write limit. The book stays a draft until
      // all chunks finish and the server validates the complete collection.
      const chapterWrites = chapters.map(ch => ({ ref: doc(collection(db, 'books', bookRef.id, 'chapters')), data: {
          bookId: bookRef.id,
          chapterNumber: ch.chapterNumber,
          title: ch.title,
          content: ch.content,
          wordCount: ch.wordCount,
          isPreview: ch.isPreview ?? ch.chapterNumber === 1,
          isLocked: !(ch.isPreview ?? ch.chapterNumber === 1),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } }));
      const writes = [...oldChapters.docs.map(ch => ({ ref: ch.ref, data: null })), ...chapterWrites];
      for (let offset = 0; offset < writes.length; offset += 400) {
        const batch = writeBatch(db);
        for (const write of writes.slice(offset, offset + 400)) {
          if (write.data) batch.set(write.ref, write.data); else batch.delete(write.ref);
        }
        await batch.commit();
      }

      if (shouldCreatePublicListing) {
        const result = await authenticatedPost<{ status: string }>(`/api/books/${bookRef.id}/publish`, {});
        nextBookStatus = result.status;
      }

      await authenticatedPost('/api/seller/profile', {});

      const resultParams = new URLSearchParams({
        published: nextBookStatus,
        mode: publishMode,
      });
      if (shouldCreatePublicListing && requiresRightsReview) {
        resultParams.set('review', 'copyright');
      }
      await localDraft.clear().catch(() => {});
      router.push(`/listings?${resultParams.toString()}`);
    } catch (err) {
      console.error('Publish error:', err);
      setPublishError(
        err instanceof Error && err.message
          ? err.message
          : 'We could not publish this book. Please try again.'
      );
    } finally {
      publishBusy.current = false;
      setPublishing(false);
    }
  }

  const checklist = [
    { label: 'Title added', done: !!title },
    { label: 'Description added', done: !!description },
    { label: 'Genre selected', done: !!genre },
    { label: 'Cover configured', done: !!accentColor },
    { label: isPdf ? 'Magazine PDF added' : 'Book content added', done: isPdf ? !!pdfFile || pdfPageCount > 0 : chapters.length > 0 },
    { label: 'Customer price includes earnings and fees', done: pricingValid && directSaleFee !== null && price >= 50 },
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

  if (sellerLoading || editLoading || !localDraft.ready) return (
    <div className="min-h-screen bg-[#0e0e0e]"><SellerHeader />
      <div className="flex justify-center pt-16"><LoadingSpinner size={32} /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6 xl:flex-row xl:gap-8">

        {/* Main form */}
        <fieldset disabled={publishing} className="flex-1 min-w-0 space-y-6">
          <h1 className="font-display text-2xl text-white">{editingBook ? 'Edit book' : 'Publish a book'}</h1>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-[#bbb]">
            <p role="status">{localDraft.status === 'unavailable' ? 'Draft saving is unavailable on this device. Keep this page open and save your work before leaving.' : localDraft.status === 'saving' ? 'Saving draft on this device…' : localDraft.restored ? 'Your unfinished draft was restored on this device.' : 'Draft saved on this device.'}</p>
            <p className="mt-1 text-xs">Details, selected files and chapter edits are saved automatically. This local copy is not published or synced to other devices. Clearing browser data removes it.</p>
            {localDraft.restored && <p className="mt-1 text-xs">Review your selected files before publishing. If a file was still saving when the page closed, select it again.</p>}
            {discardingDraft ? <div className="mt-2 flex flex-wrap items-center gap-3">
              <p>Discard these local changes? Saved listings stay unchanged.</p>
              <button type="button" className="min-h-11 text-red-300" onClick={async () => {
                try { await localDraft.clear(); resetDraft(); }
                catch { setPublishError('Unable to discard the local draft. Please try again.'); }
              }}>Discard changes</button>
              <button type="button" className="min-h-11" onClick={() => setDiscardingDraft(false)}>Keep editing</button>
            </div> : <button type="button" className="mt-1 min-h-11 text-[#f5b800]" onClick={() => setDiscardingDraft(true)}>Discard local draft</button>}
          </div>
          {editingBook && <p className="text-sm text-[#aaa]">Saving updates this existing book. It becomes a private draft while the changes are saved, then returns through publication review. Existing purchase records are preserved.</p>}
          {publishError && <p role="alert" className="text-sm text-[#e8442a]">{publishError}</p>}
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
                <h2 className="font-display text-display-sm text-white">{publicationType === 'magazine' ? 'Magazine Details' : 'Book Details'}</h2>
                <div>
                  <label htmlFor="publication-type" className="mb-1.5 block text-sm text-[#aaa]">What are you publishing?</label>
                  <select id="publication-type" value={publicationType} onChange={event => setPublicationType(event.target.value as PublicationType)} className="min-h-11 w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 text-sm text-[#f5f2eb]">
                    <option value="book">Book</option><option value="magazine">Magazine issue</option><option value="short_story">Short story</option>
                  </select>
                  {publicationType === 'magazine' && <p className="mt-2 text-xs leading-relaxed text-[#aaa]">Publish one complete issue per listing. Readers buy this issue once and keep it in their library. Your author account receives the earnings for your publication.</p>}
                </div>
                <div>
                  <label htmlFor="publication-title" className="block text-sm text-[#aaa] mb-1.5">{publicationType === 'magazine' ? 'Magazine title' : 'Book Title'}</label>
                  <input id="publication-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={publicationType === 'magazine' ? 'e.g. African Culture Review' : 'Enter book title'} className="w-full px-3.5 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                {publicationType === 'magazine' && <div>
                  <label htmlFor="magazine-issue" className="mb-1.5 block text-sm text-[#aaa]">Issue / edition (optional)</label>
                  <input id="magazine-issue" value={issueLabel} onChange={event => setIssueLabel(event.target.value)} maxLength={60} placeholder="e.g. Issue 12 · October 2026" className="min-h-11 w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3.5 text-sm text-[#f5f2eb]" />
                </div>}
                <div>
                  <label htmlFor="publication-author" className="block text-sm text-[#aaa] mb-1.5">{publicationType === 'magazine' ? 'Publisher / organization name' : 'Author Name'}</label>
                  <input id="publication-author" value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
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
                      {['English', 'Tigrinya', 'Amharic', 'Arabic', 'French', 'Swahili', 'Yoruba', 'Portuguese', 'Chinese'].map((l) => <option key={l}>{l}</option>)}
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
                <h2 className="font-display text-display-sm text-white">{publicationType === 'magazine' ? 'Magazine Content' : 'Book Content'}</h2>
                {publicationType === 'magazine' && <div>
                  <label htmlFor="magazine-format" className="mb-2 block text-sm text-[#aaa]">How would you like readers to view this issue?</label>
                  <select id="magazine-format" value={contentFormat} onChange={event => setContentFormat(event.target.value as 'text' | 'pdf')} className="min-h-11 w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 text-sm text-white"><option value="text">Editor / text articles</option><option value="pdf">PDF — keep images and page layouts</option></select>
                </div>}
                {isPdf ? <div className="space-y-3 rounded-xl border border-[#333] bg-[#161616] p-4">
                  <label htmlFor="magazine-pdf" className="block text-sm font-medium text-white">Upload the complete magazine PDF</label>
                  <p className="text-sm leading-relaxed text-[#aaa]">Keep your photos, columns and page design. Readers can turn pages and zoom. Use an unencrypted PDF, up to 20 MB and 500 pages.</p>
                  <input id="magazine-pdf" type="file" accept=".pdf,application/pdf" className="block w-full min-w-0 text-sm text-[#ccc]" onChange={event => {
                    const file = event.target.files?.[0] ?? null;
                    if (file && (file.size > 20 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf'))) { setPublishError('Choose a PDF of 20 MB or less.'); event.target.value = ''; return; }
                    setPdfFile(file); setPublishError('');
                  }} />
                  <p className="text-xs text-[#aaa]">{pdfFile ? `${pdfFile.name} will be checked when you save.` : pdfPageCount ? `Saved PDF: ${pdfPageCount} pages.` : 'The file is checked when you save or publish.'}</p>
                  <p className="text-xs text-[#aaa]">Your cover and description introduce the issue before purchase. Full PDF pages are available to purchasers.</p>
                </div> : <>
                <ManuscriptUpload chapterCount={chapters.length} fileName={manuscriptFileName} language={language} onBusy={setManuscriptImporting} onImport={imported => {
                  setChapters(imported.chapters); setManuscriptFileName(imported.fileName); setManuscriptFile(imported.sourceFile); setEditingChapter(null); setEditorDraft(null);
                }} />

                {editingChapter === null && !manuscriptImporting && <ReadingSectionSplitter chapters={chapters} onApply={setChapters} />}
                <ChapterPreviewSummary chapters={chapters} />

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
                        aria-label={`Free preview for chapter ${ch.chapterNumber}: ${ch.title}`} aria-pressed={ch.isPreview === true}
                        className="text-xs px-2 py-0.5 rounded transition-colors"
                        style={{ background: ch.isPreview ? '#0f2e1a' : '#1a1a2e', color: ch.isPreview ? '#4ade80' : '#555' }}>
                        {ch.isPreview ? 'FREE PREVIEW' : 'LOCKED'}
                      </button>
                      <button type="button" disabled={editingChapter !== null && editingChapter !== ch.chapterNumber} onClick={() => setEditingChapter(ch.chapterNumber)} className="min-h-11 text-xs text-[#e8442a] disabled:opacity-40">Edit</button>
                    </div>
                  </div>
                ))}

                {editingChapter !== null ? (
                  <ChapterEditor
                    key={editingChapter}
                    chapterNumber={editingChapter}
                    onSave={saveChapter}
                    onCancel={() => { setEditingChapter(null); setEditorDraft(null); }}
                    onDraftChange={setEditorDraft}
                    initial={editorDraft?.chapterNumber === editingChapter ? editorDraft : chapters.find((c) => c.chapterNumber === editingChapter)}
                  />
                ) : (
                  <button type="button" onClick={() => setEditingChapter(chapters.length + 1)}
                    className="w-full py-3 rounded-xl border-2 border-dashed text-sm transition-colors"
                    style={{ borderColor: '#333', color: '#666' }}>
                    + Add Chapter
                  </button>
                )}
                </>}
              </div>
            )}

            {/* Step 4: Pricing */}
            {step === 3 && (
              <div className="space-y-5">
                {directSaleFee !== null
                  ? <BookPricing price={price} directSaleFee={directSaleFee} wordCount={chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)} genre={genre} audience={ageGroup} publicationType={publicationType} onPriceChange={setPrice} onValidityChange={setPricingValid} />
                  : <p role={pricingError ? 'alert' : 'status'} className="text-sm text-[#aaa]">{pricingError || 'Loading pricing…'}</p>}

                {contentFormat !== 'pdf' && <ChapterPreviewSummary chapters={chapters} />}
              </div>
            )}

            {/* Step 5: Publish */}
            {step === 4 && (
              <div className="space-y-5">
                <h2 className="font-display text-display-sm text-white">Pre-Publish Checklist</h2>
                {contentFormat !== 'pdf' && <ChapterPreviewSummary chapters={chapters} />}
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
                  disabled={editLoading || publishing || manuscriptImporting || (publishMode === 'preorder' && !releaseDate) || publishActionBlocked}
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
              <button type="button" onClick={prevStep} disabled={step === 0 || manuscriptImporting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border disabled:opacity-30"
                style={{ borderColor: '#333', color: '#aaa' }}>
                <ArrowLeft size={14} /> Back
              </button>
              {step < 4 && (
                <button type="button" onClick={nextStep} disabled={manuscriptImporting || (step === 3 && (!pricingValid || directSaleFee === null))}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                  style={{ background: '#e8442a', color: '#fff' }}>
                  Next <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </fieldset>

        {/* Live Preview */}
        <div className="w-full xl:w-72 xl:flex-shrink-0">
          <div className="rounded-xl border p-4 xl:sticky xl:top-20" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-xs text-[#555] uppercase tracking-wider mb-3">Live Preview</p>

            {/* Mini cover */}
            <div className="rounded-xl overflow-hidden mb-3 relative" style={{ height: 160, background: bgColor }}>
              <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: accentColor }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85))' }} />
              <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#f5b800', color: '#000', fontSize: 8 }}>{publicationType === 'magazine' ? 'MAGAZINE' : 'EBOOK'}</span>
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
                <span>{isPdf ? 'PDF pages' : publicationType === 'magazine' ? 'Articles' : 'Chapters'}</span>
                <span className="text-[#aaa]">{isPdf ? pdfPageCount || 'Checked on save' : chapters.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer price</span>
                <span style={{ color: '#f5b800' }}>${(price / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>{publicationType === 'short_story' ? 'Earnings' : 'Estimated earnings/sale'}</span>
                <span style={{ color: '#4ade80' }}>{publicationType === 'short_story' ? 'See cart example in Pricing' : earnings?.sellerEarningsDisplay ?? '—'}</span>
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

function PublishSession() {
  const uid = useAuthStore(state => state.userProfile?.uid);
  const editId = useSearchParams().get('edit');
  const [revision, setRevision] = useState(0);
  return <PublishWorkspace key={`${uid ?? 'guest'}:${editId ?? 'new'}:${revision}`} editId={editId} resetDraft={() => setRevision(value => value + 1)} />;
}

export default function PublishPage() {
  return <Suspense fallback={<LoadingSpinner size={32} />}><PublishSession /></Suspense>;
}
