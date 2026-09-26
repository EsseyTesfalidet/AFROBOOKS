'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark, Receipt, Star, Trash2, ArrowUpRight } from 'lucide-react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getBook, getUserWishlist, removeWishlistItem, getUserOrders } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import type { Book } from '@/types/book';
import type { Order } from '@/types/order';
import type { Review } from '@/types/review';
import { buttonClass, panelClass } from './profileSections';
import { useCatalog } from '@/hooks/useCatalog';

type Section = 'wishlist' | 'history' | 'reviews';
const labels = {
  wishlist: { title: 'Saved for later', description: 'Your next great read, waiting for you.', empty: 'Your next read starts here', detail: 'Save a book from its details page and find it here whenever you’re ready.', icon: Bookmark },
  history: { title: 'Your purchases', description: 'Purchase details and receipts, in one place.', empty: 'No purchases yet', detail: 'Books you purchase will appear here with their order status and receipt.', icon: Receipt },
  reviews: { title: 'Your reviews', description: 'The thoughts you’ve shared with other readers.', empty: 'Every reader has a perspective', detail: 'After buying a book, visit its details page to leave a review.', icon: Star },
};

export default function ProfileCollections({ section }: { section: Section }) {
  const catalog = useCatalog();
  const uid = useAuthStore(s => s.userProfile?.uid);
  const close = useBuyerDrawerStore(s => s.close);
  const [storedSaved, setSaved] = useState<{ id: string; bookId: string; book: Book | null }[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [storedReviews, setReviews] = useState<(Review & { bookTitle: string; available: boolean })[]>([]);
  const saved = storedSaved.filter(item => catalog.books.some(book => book.id === item.bookId));
  const reviews = storedReviews.filter(item => catalog.books.some(book => book.id === item.bookId));
  const [loadingRows, setLoading] = useState(true);
  const [loadError, setError] = useState('');
  const loading = loadingRows || (section !== 'history' && catalog.loading);
  const error = loadError || (section !== 'history' ? catalog.error : '');
  const [actionError, setActionError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    setLoading(true); setError('');
    async function load() {
      if (section === 'wishlist') {
        const items = await getUserWishlist(uid!);
        const rows = await Promise.all(items.map(async item => ({ id: item.id, bookId: item.bookId, book: await getBook(item.bookId).catch(() => null) })));
        if (active) setSaved(rows);
      } else if (section === 'history') {
        const rows = await getUserOrders(uid!);
        if (active) setOrders(rows);
      } else {
        const snapshot = await getDocs(query(collection(db, 'reviews'), where('reviewerId', '==', uid), orderBy('createdAt', 'desc')));
        const rows = await Promise.all(snapshot.docs.map(async item => {
          const review = { ...item.data(), id: item.id } as Review;
          const book = await getBook(review.bookId).catch(() => null);
          return { ...review, bookTitle: book?.title ?? 'Book currently unavailable', available: !!book };
        }));
        if (active) setReviews(rows);
      }
    }
    load().catch(() => { if (active) setError('We couldn’t load this section. Please check your connection and try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uid, section, attempt]);

  async function remove(id: string) {
    if (removing) return;
    setRemoving(id); setActionError(''); setAnnouncement('');
    try {
      await removeWishlistItem(id);
      setSaved(current => current.filter(item => item.id !== id));
      setAnnouncement('Book removed from your saved list.');
    } catch { setActionError('This book could not be removed. Please try again.'); }
    finally { setRemoving(null); }
  }
  const copy = labels[section];
  const count = section === 'wishlist' ? saved.length : section === 'history' ? orders.length : reviews.length;
  const Icon = copy.icon;
  return <div className="space-y-5">
    <div><h2 className="text-[26px] font-semibold tracking-tight">{copy.title}</h2><p className="mt-2 text-[14px] leading-relaxed text-[#a39f97]">{copy.description}</p></div>
    <p role="status" className="sr-only">{announcement}</p>
    {actionError && <p role="alert" className="text-[14px] text-red-300">{actionError}</p>}
    {loading ? <div role="status" className="flex items-center justify-center gap-3 py-16 text-[14px] text-[#a39f97]"><LoadingSpinner size={22} />Loading {section === 'history' ? 'purchases' : section === 'wishlist' ? 'saved books' : 'reviews'}…</div>
      : error ? <div className={`${panelClass} space-y-4`}><p role="alert" className="text-[14px] text-red-300">{error}</p><button type="button" onClick={() => { if (catalog.error) catalog.retry(); setAttempt(n => n + 1); }} className={`${buttonClass} border border-white/15`}>Try again</button></div>
      : !count ? <div className={`${panelClass} flex flex-col items-center py-12 text-center`}>
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#c1a56c]/10 text-[#c1a56c]"><Icon size={26} strokeWidth={1.5} /></div>
        <h3 className="text-[20px] font-semibold tracking-tight">{copy.empty}</h3><p className="mb-6 mt-3 max-w-[280px] text-[14px] leading-relaxed text-[#a39f97]">{copy.detail}</p>
        <Link href="/browse" onClick={close} className={`${buttonClass} bg-[#e8442a] text-white hover:bg-[#ce3a23]`}>Explore books<ArrowUpRight size={16} /></Link>
      </div> : <div className="space-y-3">
        {section === 'wishlist' && saved.map(item => <article key={item.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
          <div className="flex h-[84px] w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[20px] font-semibold tracking-tight" style={{ background: item.book?.coverBgColor || '#252322', color: item.book?.coverAccentColor || '#c1a56c' }}>
            {item.book?.coverUrl ? <img src={item.book.coverUrl} alt="" className="h-full w-full object-cover" /> : item.book?.title.charAt(0) || <Bookmark size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            {item.book ? <Link href={`/book/${item.bookId}`} onClick={close} className="block rounded text-[14px] font-semibold leading-snug hover:underline focus-visible:outline focus-visible:outline-[#f5b800]">{item.book.title}</Link> : <p className="text-[14px] text-[#a39f97]">Book currently unavailable</p>}
            <p className="mt-1 truncate text-[12px] text-[#a39f97]">{item.book?.authorName}</p>
            {item.book && <p className="mt-2 text-[14px] text-[#c1a56c]">{centsToDisplay(item.book.price)}</p>}
          </div>
          <button type="button" aria-label={`Remove ${item.book?.title || 'unavailable book'} from saved books`} disabled={!!removing} onClick={() => remove(item.id)} className={`${buttonClass} !h-11 !w-11 shrink-0 !p-0 text-[#a39f97] hover:bg-white/5 hover:text-red-300`}>{removing === item.id ? <LoadingSpinner size={16} /> : <Trash2 size={17} />}</button>
        </article>)}
        {section === 'history' && orders.map(order => <article key={order.id} className={`${panelClass} space-y-4`}>
          <div className="flex items-start justify-between gap-4"><h3 className="text-[14px] font-semibold leading-relaxed">{order.bookTitle}</h3><span className="shrink-0 text-[14px] text-[#c1a56c]">{centsToDisplay(order.finalPrice)}</span></div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2"><span className={`inline-block rounded-full px-2.5 py-1 text-[12px] capitalize ${order.status === 'completed' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-[#c6c2b8]'}`}>{order.status === 'completed' ? 'Purchased' : order.status}</span>
              <p className="text-[12px] text-[#8d897f]">{order.createdAt?.toDate?.()?.toLocaleDateString?.() ?? 'Date unavailable'}</p></div>
            <Link href={`/checkout/receipt?orders=${encodeURIComponent(order.id)}`} onClick={close} className={`${buttonClass} !px-3 text-[#c6c2b8] hover:bg-white/5`}>{order.status === 'completed' ? 'View receipt' : 'View status'}<ArrowUpRight size={15} /></Link>
          </div>
        </article>)}
        {section === 'reviews' && reviews.map(review => <article key={review.id} className={`${panelClass} space-y-3`}>
          {review.available ? <Link href={`/book/${review.bookId}`} onClick={close} className="text-[14px] font-semibold hover:underline">{review.bookTitle}</Link> : <p className="text-[14px] text-[#a39f97]">{review.bookTitle}</p>}
          <div aria-label={`${review.stars} out of 5 stars`} className="flex gap-1">{[1,2,3,4,5].map(star => <Star aria-hidden="true" key={star} size={14} fill={star <= review.stars ? '#c1a56c' : 'none'} className="text-[#c1a56c]" />)}</div>
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[#c6c2b8]">{review.body}</p>
          <p className="text-[12px] text-[#8d897f]">{review.createdAt?.toDate?.()?.toLocaleDateString?.() ?? ''}{review.status === 'removed' ? ' · Removed' : ''}</p>
        </article>)}
      </div>}
  </div>;
}
