'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, BadgeCheck, Flag, X, BookOpen, Calendar, Share2, Copy, Check } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import StarRating from '@/components/shared/StarRating';
import StatusPill from '@/components/shared/StatusPill';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import ReviewCard from '@/components/buyer/ReviewCard';
import ReviewForm from '@/components/buyer/ReviewForm';
import PromoCodeInput from '@/components/buyer/PromoCodeInput';
import FollowButton from '@/components/shared/FollowButton';
import { getBook, getBookReviews, isBookInLibrary, createReport, getSimilarBooks } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { useRecentlyViewedStore } from '@/store/recentlyViewedStore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';
import type { Review } from '@/types/review';

const REPORT_REASONS = [
  'Inappropriate or offensive content',
  'Copyright violation',
  'Spam or misleading description',
  'Incorrect book information',
  'Other',
];

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userProfile = useAuthStore((s) => s.userProfile);
  const { addItem, isInCart, applyPromo, removePromo, promoCode, promoBookId } = useCartStore();
  const addRecentlyViewedBook = useRecentlyViewedStore((state) => state.addBook);

  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [similar, setSimilar] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [owned, setOwned] = useState(false);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [selectedOption, setSelectedOption] = useState<'buy' | 'subscribe'>('buy');
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  // Report modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  useEffect(() => {
    Promise.all([
      getBook(id),
      getBookReviews(id),
      userProfile ? isBookInLibrary(userProfile.uid, id) : Promise.resolve(false),
    ]).then(([b, r, o]) => {
      setBook(b);
      setReviews(r);
      setOwned(o);
      setLoading(false);
      setReviewsLoaded(true);
      if (b) getSimilarBooks(b.genre, id).then(setSimilar);
    });
  }, [id, userProfile?.uid]);

  useEffect(() => {
    if (promoBookId === id && promoCode) {
      setAppliedCode(promoCode);
    } else {
      setAppliedCode(null);
      setDiscount(0);
    }
  }, [id, promoBookId, promoCode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(window.location.href);
    }
  }, [id]);

  useEffect(() => {
    if (book?.id) {
      addRecentlyViewedBook(book.id);
    }
  }, [addRecentlyViewedBook, book?.id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]"><LoadingSpinner size={36} /></div>;
  if (!book) return <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e] text-[#444]">Book not found.</div>;

  const effectivePrice = Math.max(0, book.price - discount);
  const isSubscriber = userProfile?.subscriptionStatus === 'active';
  const canSubRead = isSubscriber && book.inSubscription;
  const showBothOptions = book.subscriptionOptInType === 'sell_and_sub' && !isSubscriber;

  // Pre-order state
  const releaseDate = book.releaseDate?.toDate?.() ?? null;
  const isPreorder = book.isPreorder && releaseDate && releaseDate > new Date();

  const ratingCounts = [5, 4, 3, 2, 1].map((s) => ({
    stars: s,
    count: reviews.filter((r) => r.stars === s).length,
  }));

  const primaryCtaLabel = isPreorder
    ? `Pre-order — ${centsToDisplay(book.price)}`
    : selectedOption === 'subscribe'
      ? 'Subscribe to Read'
      : isInCart(book.id)
        ? 'View Cart'
        : `Buy Now — ${centsToDisplay(effectivePrice)}`;

  const mobilePriceLabel =
    owned
      ? 'Owned forever'
      : canSubRead
        ? 'Included in your plan'
        : selectedOption === 'subscribe'
          ? '$9.99/mo'
          : centsToDisplay(isPreorder ? book.price : effectivePrice);

  function handleBuy() {
    if (selectedOption === 'subscribe') { router.push('/subscription'); return; }
    if (!book) return;
    addItem(book);
    router.push('/cart');
  }

  async function handleReport() {
    if (!reportReason || !userProfile || !book) return;
    setReportSubmitting(true);
    await createReport({
      reporterId: userProfile.uid,
      reporterName: `${userProfile.firstName} ${userProfile.lastName}`,
      targetType: 'book',
      targetId: book.id,
      targetName: book.title,
      reason: reportReason,
      status: 'open',
    });
    setReportSubmitting(false);
    setReportDone(true);
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="max-w-2xl mx-auto px-4 py-6 pb-36 sm:py-8 sm:pb-8 space-y-6">

        {/* Book Header */}
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="relative mx-auto overflow-hidden rounded-xl sm:mx-0 sm:flex-shrink-0" style={{ width: 140, height: 200, background: book.coverBgColor }}>
            <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: book.coverAccentColor }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85))' }} />
            {book.inSubscription && (
              <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#7c3aed', color: '#fff', fontSize: 9 }}>SUB</span>
            )}
            {isPreorder && (
              <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#0ea5e9', color: '#fff', fontSize: 9 }}>PRE-ORDER</span>
            )}
            {book.coverUrl
              ? <img src={book.coverUrl} alt={book.title} className="absolute inset-0 w-full h-full object-cover" />
              : <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#f5b800', color: '#000', fontSize: 9 }}>EBOOK</span>
            }
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <p className="font-display text-white leading-tight" style={{ fontSize: 14 }}>{book.title}</p>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="font-display text-display-md text-white leading-none mb-1">{book.title}</h1>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Link href={`/author/${book.sellerId}`} className="text-sm text-[#aaa] hover:text-white transition-colors">{book.authorName}</Link>
              {book.sellerVerified && <BadgeCheck size={14} style={{ color: '#f5b800' }} />}
              <FollowButton sellerId={book.sellerId} />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <StarRating value={book.averageRating} size={13} />
              <span className="text-xs text-[#666]">({book.reviewCount})</span>
            </div>
            <p className="text-sm text-[#aaa] leading-relaxed line-clamp-4">{book.description}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-xs px-2 py-1 rounded-full border" style={{ borderColor: '#333', color: '#888' }}>{book.genre}</span>
              <span className="text-xs px-2 py-1 rounded-full border" style={{ borderColor: '#333', color: '#888' }}>{book.readTime}</span>
              <span className="text-xs px-2 py-1 rounded-full border" style={{ borderColor: '#333', color: '#888' }}>{book.language}</span>
            </div>

            {/* Pre-order release date */}
            {isPreorder && releaseDate && (
              <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: '#0ea5e9' }}>
                <Calendar size={12} />
                Available {releaseDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>
        </div>

        {/* Promo Code */}
        {!owned && !isPreorder && book.subscriptionOptInType !== 'sub_only' && (
          <PromoCodeInput
            bookId={book.id}
            sellerId={book.sellerId}
            bookPrice={book.price}
            onApply={(c, d, bookId) => {
              setAppliedCode(c);
              setDiscount(d);
              applyPromo(c, d, bookId);
            }}
            onRemove={() => {
              setAppliedCode(null);
              setDiscount(0);
              removePromo();
            }}
            appliedCode={appliedCode}
          />
        )}

        {/* Purchase / Pre-order Options */}
        {!owned && !canSubRead && (
          <div className="space-y-3">
            {!isPreorder && showBothOptions && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setSelectedOption('subscribe')}
                  className="p-4 rounded-xl border text-left transition-all"
                  style={{ border: selectedOption === 'subscribe' ? '1.5px solid #7c3aed' : '1.5px solid #2a2a2a', background: selectedOption === 'subscribe' ? '#1a0f2e' : '#111' }}>
                  <p className="text-xs text-[#7c3aed] font-medium uppercase tracking-wider mb-1">Unlimited Plan</p>
                  <p className="font-display text-white text-xl">$9.99<span className="text-sm font-body text-[#888]">/mo</span></p>
                  <p className="text-xs text-[#666] mt-1">Read with subscription</p>
                </button>
                <button type="button" onClick={() => setSelectedOption('buy')}
                  className="p-4 rounded-xl border text-left transition-all"
                  style={{ border: selectedOption === 'buy' ? '1.5px solid #e8442a' : '1.5px solid #2a2a2a', background: selectedOption === 'buy' ? '#1f0e0c' : '#111' }}>
                  <p className="text-xs text-[#e8442a] font-medium uppercase tracking-wider mb-1">Buy to Own</p>
                  <p className="font-display text-white text-xl">{centsToDisplay(effectivePrice)}</p>
                  <p className="text-xs text-[#666] mt-1">Yours forever</p>
                </button>
              </div>
            )}

            <button type="button" onClick={handleBuy}
              className="hidden w-full py-3.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 sm:block"
              style={{ background: isPreorder ? '#0ea5e9' : selectedOption === 'subscribe' ? '#7c3aed' : '#e8442a', color: '#fff' }}>
              {primaryCtaLabel}
            </button>

            {isPreorder && releaseDate && (
              <p className="text-center text-xs text-[#555]">
                You'll get access on {releaseDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}

            {!isPreorder && (
              <div className="flex items-center justify-center gap-2 text-xs text-[#444]">
                <ShieldCheck size={12} />
                Secured by Stripe · In-app reading only
              </div>
            )}
          </div>
        )}

        {/* Read Sample button */}
        {!owned && !isPreorder && (
          <div className="flex justify-center">
            <Link href={`/sample/${book.id}`}
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: '#888' }}>
              <BookOpen size={14} />
              Read free sample
            </Link>
          </div>
        )}

        {/* Already owned / subscriber */}
        {(owned || canSubRead) && (
          <button type="button" onClick={() => router.push(`/read/${book.id}`)}
            className="hidden w-full py-3.5 rounded-xl text-sm font-medium sm:block"
            style={{ background: owned ? '#e8442a' : '#7c3aed', color: '#fff' }}>
            {canSubRead && !owned ? 'Read Now (Included in your plan)' : 'Read Now'}
          </button>
        )}

        {/* Share */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs flex items-center gap-1" style={{ color: '#555' }}><Share2 size={11} /> Share:</span>
          <button type="button"
            onClick={() => { if (!shareUrl) return; navigator.clipboard.writeText(shareUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors"
            style={{ borderColor: '#2a2a2a', color: linkCopied ? '#4ade80' : '#666', background: '#111' }}>
            {linkCopied ? <Check size={11} /> : <Copy size={11} />}
            {linkCopied ? 'Copied!' : 'Copy link'}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`"${book.title}" by ${book.authorName} on AfroBooks — ${shareUrl}`)}`}
            target="_blank" rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg text-xs border transition-colors hover:text-white"
            style={{ borderColor: '#2a2a2a', color: '#666', background: '#111' }}>
            WhatsApp
          </a>
          <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`"${book.title}" by ${book.authorName}`)}&url=${encodeURIComponent(shareUrl)}`}
            target="_blank" rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg text-xs border transition-colors hover:text-white"
            style={{ borderColor: '#2a2a2a', color: '#666', background: '#111' }}>
            X / Twitter
          </a>
        </div>

        {/* Report this book */}
        {userProfile && (
          <div className="flex justify-center">
            <button type="button" onClick={() => setReportOpen(true)}
              className="flex items-center gap-1.5 text-xs text-[#444] hover:text-[#888] transition-colors">
              <Flag size={11} /> Report this book
            </button>
          </div>
        )}

        {/* Reviews */}
        <div>
          <h2 className="font-display text-display-sm text-white mb-4">Reviews</h2>
          {reviews.length > 0 && (
            <div className="mb-4 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:gap-6" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <div className="text-center">
                <p className="font-display text-5xl text-white">{book.averageRating.toFixed(1)}</p>
                <StarRating value={book.averageRating} size={14} />
                <p className="text-xs text-[#555] mt-1">{book.reviewCount} reviews</p>
              </div>
              <div className="flex-1 space-y-1.5">
                {ratingCounts.map(({ stars, count }) => (
                  <div key={stars} className="flex items-center gap-2">
                    <span className="text-xs text-[#555] w-4">{stars}</span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: '#222' }}>
                      <div className="h-full rounded-full" style={{ width: reviews.length ? `${(count / reviews.length) * 100}%` : '0%', background: '#f5b800' }} />
                    </div>
                    <span className="text-xs text-[#555] w-4">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {owned && userProfile ? (
            <div className="mb-4">
              <ReviewForm bookId={book.id} user={userProfile} onSuccess={() => getBookReviews(id).then(setReviews)} />
            </div>
          ) : !owned ? (
            <p className="text-sm text-[#444] mb-4">Purchase this book to leave a review.</p>
          ) : null}

          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} isSeller={userProfile?.uid === book.sellerId} currentUserId={userProfile?.uid} />
            ))}
            {reviews.length === 0 && reviewsLoaded && (
              <p className="text-sm text-[#444] text-center py-6">No reviews yet. Be the first!</p>
            )}
          </div>
        </div>
        {/* Similar books */}
        {similar.length > 0 && (
          <div>
            <h2 className="font-display text-display-sm text-white mb-4">You might also like</h2>
            <div
              className="-mx-4 px-4 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none"
              style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              {similar.map((b) => (
                <Link
                  key={b.id}
                  href={`/book/${b.id}`}
                  className="flex-shrink-0 snap-start rounded-xl overflow-hidden border"
                  style={{ width: 118, background: '#111', borderColor: '#1a1a1a' }}
                >
                  <div className="relative" style={{ height: 158, background: b.coverBgColor || '#1a1a1a' }}>
                    <div className="absolute top-0 left-0 right-0 h-1" style={{ background: b.coverAccentColor || '#f5b800' }} />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.88))' }} />
                    {b.coverUrl && <img src={b.coverUrl} alt={b.title} className="absolute inset-0 w-full h-full object-cover" />}
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <p className="text-white font-medium truncate" style={{ fontSize: 11 }}>{b.title}</p>
                      <p className="truncate" style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)' }}>{b.authorName}</p>
                    </div>
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-medium" style={{ color: '#f5b800' }}>{centsToDisplay(b.price)}</p>
                    {b.averageRating > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: '#555' }}>★ {b.averageRating.toFixed(1)}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      <div
        className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3"
        style={{ background: 'rgba(14,14,14,0.96)', borderColor: '#1f1f1f', backdropFilter: 'blur(18px)' }}
      >
        <div className="mx-auto max-w-2xl">
          <div
            className="rounded-[24px] border p-3"
            style={{ background: '#121212', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{book.title}</p>
                <p className="mt-0.5 text-xs" style={{ color: selectedOption === 'subscribe' ? '#b794f4' : '#777' }}>
                  {mobilePriceLabel}
                </p>
              </div>

              {owned || canSubRead ? (
                <button
                  type="button"
                  onClick={() => router.push(`/read/${book.id}`)}
                  className="rounded-2xl px-4 py-3 text-sm font-medium"
                  style={{ background: owned ? '#e8442a' : '#7c3aed', color: '#fff' }}
                >
                  Read now
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleBuy}
                  className="rounded-2xl px-4 py-3 text-sm font-medium"
                  style={{
                    background: isPreorder ? '#0ea5e9' : selectedOption === 'subscribe' ? '#7c3aed' : '#e8442a',
                    color: '#fff',
                  }}
                >
                  {selectedOption === 'subscribe' ? 'Subscribe' : isInCart(book.id) ? 'View cart' : 'Buy now'}
                </button>
              )}
            </div>

            {!owned && !canSubRead && !isPreorder ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <Link href={`/sample/${book.id}`} className="text-xs" style={{ color: '#888' }}>
                  Read sample
                </Link>
                <span className="text-xs" style={{ color: '#555' }}>
                  {selectedOption === 'subscribe' ? 'Unlimited access option selected' : 'Own this title forever'}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-display-sm text-white">Report Book</h3>
              <button type="button" title="Close" onClick={() => { setReportOpen(false); setReportReason(''); setReportDone(false); }}
                className="p-1 rounded-lg hover:bg-[#1a1a1a]">
                <X size={16} style={{ color: '#666' }} />
              </button>
            </div>

            {reportDone ? (
              <div className="py-4 text-center space-y-2">
                <p className="text-sm font-medium" style={{ color: '#4ade80' }}>Report submitted</p>
                <p className="text-xs text-[#555]">Our team will review this within 24 hours.</p>
                <button type="button" onClick={() => { setReportOpen(false); setReportDone(false); }}
                  className="mt-2 px-4 py-2 rounded-lg text-sm" style={{ background: '#1a1a1a', color: '#888' }}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-[#888]">Why are you reporting "{book.title}"?</p>
                <div className="space-y-2">
                  {REPORT_REASONS.map((r) => (
                    <label key={r} className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                      style={{ border: reportReason === r ? '1.5px solid #e8442a' : '1.5px solid #2a2a2a', background: reportReason === r ? '#1f0e0c' : '#1a1a1a' }}>
                      <input type="radio" name="reportReason" value={r} checked={reportReason === r}
                        onChange={() => setReportReason(r)} className="accent-[#e8442a]" />
                      <span className="text-sm text-[#aaa]">{r}</span>
                    </label>
                  ))}
                </div>
                <button type="button" onClick={handleReport} disabled={!reportReason || reportSubmitting}
                  className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-40"
                  style={{ background: '#e8442a', color: '#fff' }}>
                  {reportSubmitting ? 'Submitting…' : 'Submit Report'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
