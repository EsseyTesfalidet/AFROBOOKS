'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PlusCircle, Trash2, Pause, Play } from 'lucide-react';
import SellerHeader from '@/components/seller/SellerHeader';
import StatusPill from '@/components/shared/StatusPill';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
import { getSellerBooks } from '@/lib/firebase/firestore';
import { db } from '@/lib/firebase/config';
import { doc, updateDoc, serverTimestamp, getDocs, collection, query, where, addDoc } from 'firebase/firestore';
import { generatePromoCode } from '@/lib/utils/generatePromoCode';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';
import type { PromoCode } from '@/types/review';
import { Timestamp } from 'firebase/firestore';

function ListingsPageFallback() {
  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />
      <div className="flex justify-center pt-16"><LoadingSpinner size={36} /></div>
    </div>
  );
}

function ListingsPageContent() {
  const searchParams = useSearchParams();
  const userProfile = useAuthStore((s) => s.userProfile);
  const [books, setBooks] = useState<Book[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'books' | 'promos'>('books');
  const [codeForm, setCodeForm] = useState({
    discountType: 'percentage' as 'percentage' | 'fixed' | 'free',
    code: '', discountValue: '', applyTo: 'all', specificBookId: '',
    codeType: 'multi', maxUses: '', limitOnePerCustomer: false,
    startDate: '', expiryDate: '',
  });

  useEffect(() => {
    if (!userProfile) return;
    Promise.all([
      getSellerBooks(userProfile.uid),
      getDocs(query(collection(db, 'promoCodes'), where('sellerId', '==', userProfile.uid))),
    ]).then(([bks, promoSnap]) => {
      setBooks(bks);
      setPromoCodes(promoSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PromoCode)));
      setLoading(false);
    });
  }, [userProfile?.uid]);

  async function removeBook(bookId: string) {
    await updateDoc(doc(db, 'books', bookId), { status: 'removed', updatedAt: serverTimestamp() });
    setBooks((b) => b.filter((x) => x.id !== bookId));
  }

  async function createPromoCode() {
    if (!userProfile || !codeForm.code) return;
    const code = codeForm.code.toUpperCase();
    await addDoc(collection(db, 'promoCodes'), {
      sellerId: userProfile.uid,
      code,
      discountType: codeForm.discountType,
      discountValue: codeForm.discountType === 'percentage' ? parseInt(codeForm.discountValue) : parseInt(codeForm.discountValue) * 100,
      applyTo: codeForm.applyTo,
      specificBookId: codeForm.applyTo === 'specific' ? codeForm.specificBookId : null,
      codeType: codeForm.codeType,
      maxUses: codeForm.maxUses ? parseInt(codeForm.maxUses) : null,
      currentUses: 0,
      limitOnePerCustomer: codeForm.limitOnePerCustomer,
      startDate: Timestamp.fromDate(new Date(codeForm.startDate || Date.now())),
      expiryDate: Timestamp.fromDate(new Date(codeForm.expiryDate || Date.now() + 30 * 86400000)),
      status: 'active',
      totalRevenue: 0,
      createdAt: serverTimestamp(),
    });
    const snap = await getDocs(query(collection(db, 'promoCodes'), where('sellerId', '==', userProfile.uid)));
    setPromoCodes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PromoCode)));
  }

  const liveBooksCount = books.filter((book) => book.status === 'live').length;
  const inReviewBooksCount = books.filter((book) => book.status === 'in_review').length;
  const draftBooksCount = books.filter((book) => book.status === 'draft').length;
  const publishedStatus = searchParams.get('published');
  const publishMode = searchParams.get('mode');

  const publishNotice = useMemo(() => {
    if (publishedStatus === 'live') {
      return {
        title: publishMode === 'preorder' ? 'Pre-order is live.' : 'Book is live.',
        message:
          publishMode === 'preorder'
            ? 'Readers can now discover this title and place pre-orders.'
            : 'Readers can now discover this book in browse and search.',
        styles: { background: '#0f2e1a', borderColor: '#1a4a2a', color: '#4ade80' },
      };
    }

    if (publishedStatus === 'in_review') {
      return {
        title: 'Book sent to review.',
        message: 'It is saved correctly and will appear to readers after approval in Admin > Books.',
        styles: { background: '#102033', borderColor: '#1e3a5f', color: '#7dd3fc' },
      };
    }

    if (publishedStatus === 'draft') {
      return {
        title: 'Draft saved.',
        message: 'Drafts stay private until you publish them.',
        styles: { background: '#161616', borderColor: '#2a2a2a', color: '#aaa' },
      };
    }

    return null;
  }, [publishMode, publishedStatus]);

  if (loading) return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />
      <div className="flex justify-center pt-16"><LoadingSpinner size={36} /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-display-lg text-white">Listings</h1>
          <Link href="/publish" className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium" style={{ background: '#e8442a', color: '#fff' }}>
            <PlusCircle size={15} /> Add new ebook
          </Link>
        </div>

        {publishNotice && (
          <div className="mb-6 rounded-xl border px-4 py-3" style={publishNotice.styles}>
            <p className="text-sm font-medium">{publishNotice.title}</p>
            <p className="mt-1 text-xs opacity-90">{publishNotice.message}</p>
          </div>
        )}

        {inReviewBooksCount > 0 && (
          <div className="mb-6 rounded-xl border px-4 py-3" style={{ background: '#16120a', borderColor: '#3d2f14', color: '#f5b800' }}>
            <p className="text-sm font-medium">Review queue open</p>
            <p className="mt-1 text-xs opacity-90">
              {inReviewBooksCount} book{inReviewBooksCount === 1 ? '' : 's'} awaiting approval. Approve them in Admin &gt; Books to make them visible to readers.
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-4">
          {[
            { label: 'Live', value: liveBooksCount },
            { label: 'In Review', value: inReviewBooksCount },
            { label: 'Drafts', value: draftBooksCount },
            { label: 'Total Sales', value: books.reduce((s, b) => s + b.totalSales, 0) },
          ].map(({ label, value }) => (
            <div key={label} className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <p className="text-xs text-[#555]">{label}</p>
              <p className="font-display text-2xl text-white mt-1">{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-5">
          {(['books', 'promos'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className="text-sm pb-1.5 capitalize font-medium transition-colors"
              style={{ color: tab === t ? '#f5f2eb' : '#555', borderBottom: tab === t ? '2px solid #e8442a' : '2px solid transparent' }}>
              {t === 'books' ? 'My Ebooks' : 'Promo Codes'}
            </button>
          ))}
        </div>

        {/* Books table */}
        {tab === 'books' && (
          <div className="rounded-xl border overflow-hidden" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            {books.length === 0 ? (
              <p className="text-center text-[#444] py-12 text-sm">No books have been published yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      {['Book', 'Price', 'Sales', 'Rating', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((book) => (
                      <tr key={book.id} style={{ borderBottom: '1px solid #111' }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-9 rounded flex-shrink-0" style={{ background: book.coverBgColor }} />
                            <div className="min-w-0">
                              <p className="font-medium text-white truncate max-w-[160px]">{book.title}</p>
                              {book.isPreorder && (
                                <p className="text-[10px] uppercase tracking-[0.18em] text-[#0ea5e9]">Pre-order</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#f5b800]">{centsToDisplay(book.price)}</td>
                        <td className="px-4 py-3 text-[#aaa]">{book.totalSales}</td>
                        <td className="px-4 py-3 text-[#aaa]">{book.averageRating.toFixed(1)}</td>
                        <td className="px-4 py-3"><StatusPill status={book.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Link href={`/publish?edit=${book.id}`} className="text-xs text-[#e8442a] hover:underline">Edit</Link>
                            <button type="button" title="Remove book" onClick={() => removeBook(book.id)} className="text-[#555] hover:text-[#e8442a]"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Promo codes */}
        {tab === 'promos' && (
          <div className="space-y-5">
            {/* Create form */}
            <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <h3 className="font-display text-display-sm text-white mb-4">Create Promo Code</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">Discount Type</label>
                  <select value={codeForm.discountType} title="Discount Type" onChange={(e) => setCodeForm((f) => ({ ...f, discountType: e.target.value as typeof f.discountType }))}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed Amount</option>
                    <option value="free">Free / Review Copy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">Code Name</label>
                  <div className="flex gap-2">
                    <input value={codeForm.code} onChange={(e) => setCodeForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="LAUNCH20"
                      className="flex-1 px-3 py-2.5 rounded-lg border text-sm font-mono" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5b800' }} />
                    <button type="button" onClick={() => setCodeForm((f) => ({ ...f, code: generatePromoCode() }))}
                      className="px-3 py-2.5 rounded-lg text-xs border" style={{ borderColor: '#333', color: '#aaa' }}>Auto</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">
                    {codeForm.discountType === 'percentage' ? 'Discount %' : 'Amount ($)'}
                  </label>
                  <input type="number" value={codeForm.discountValue} onChange={(e) => setCodeForm((f) => ({ ...f, discountValue: e.target.value }))}
                    placeholder={codeForm.discountType === 'percentage' ? '20' : '3.00'}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
                <div>
                  <label className="block text-sm text-[#aaa] mb-1.5">Expiry Date</label>
                  <input type="date" title="Expiry Date" value={codeForm.expiryDate} onChange={(e) => setCodeForm((f) => ({ ...f, expiryDate: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
                </div>
              </div>
              <button type="button" onClick={createPromoCode}
                className="mt-4 px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: '#f5b800', color: '#000' }}>
                Create Promo Code
              </button>
            </div>

            {/* Codes table */}
            {promoCodes.length > 0 && (
              <div className="rounded-xl border overflow-hidden" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      {['Code', 'Discount', 'Uses', 'Expires', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {promoCodes.map((code) => (
                      <tr key={code.id} style={{ borderBottom: '1px solid #111' }}>
                        <td className="px-4 py-3 font-display text-lg" style={{ color: '#f5b800' }}>{code.code}</td>
                        <td className="px-4 py-3 text-[#aaa]">
                          {code.discountType === 'percentage' ? `${code.discountValue}%` : code.discountType === 'free' ? 'Free' : centsToDisplay(code.discountValue)}
                        </td>
                        <td className="px-4 py-3 text-[#aaa]">{code.currentUses}/{code.maxUses ?? '∞'}</td>
                        <td className="px-4 py-3 text-[#aaa]">{code.expiryDate?.toDate?.().toLocaleDateString?.()}</td>
                        <td className="px-4 py-3"><StatusPill status={code.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ListingsPage() {
  return (
    <Suspense fallback={<ListingsPageFallback />}>
      <ListingsPageContent />
    </Suspense>
  );
}
