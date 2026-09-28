'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
import { authenticatedPost } from '@/lib/firebase/request';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { SentGift } from '@/lib/gifts';

const statusLabels = { pending: 'Awaiting payment confirmation', available: 'Waiting to be claimed', claimed: 'Claimed', needs_review: 'Needs review — contact support' };
const emailLabels = { pending: 'Email queued', sending: 'Sending gift email', sent: 'Gift email sent — check spam if it has not arrived', failed: 'Email not confirmed — retry or share the link', needs_review: 'Email needs review — share the link or contact support' };

export default function MyGiftsPage() {
  const { firebaseUser, loading: authLoading } = useAuthStore();
  const [gifts, setGifts] = useState<SentGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [share, setShare] = useState<{ id: string; url: string } | null>(null);
  const refresh = useCallback(async () => {
    if (!firebaseUser) return;
    try { const data = await authenticatedPost<{ gifts: SentGift[] }>('/api/gifts', { action: 'list' }); setGifts(data.gifts); setError(''); }
    catch { setError('Unable to load gifts. Please try again.'); }
    finally { setLoading(false); }
  }, [firebaseUser]);
  useEffect(() => {
    if (authLoading || !firebaseUser) return;
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [authLoading, firebaseUser, refresh]);

  async function act(gift: SentGift, action: 'link' | 'retry_email') {
    setBusy(gift.id); setNotice(''); setError('');
    try {
      const result = await authenticatedPost<{ url?: string }>('/api/gifts', { action, giftId: gift.id });
      if (action === 'link' && result.url) {
        setShare({ id: gift.id, url: result.url });
        try { await navigator.clipboard.writeText(result.url); setNotice('Gift link copied. Only the recipient can claim it.'); }
        catch { setNotice('Copy the link below and share it with the recipient.'); }
      } else { await refresh(); setNotice('Email status updated.'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update this gift.'); }
    finally { setBusy(''); }
  }

  return <div className="min-h-screen bg-[#0e0e0e]">
    <BuyerHeader />
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex justify-between items-center gap-4"><h1 className="font-display text-3xl text-white">My gifts</h1><Link href="/library" className="text-sm text-[#f5b800] underline">My library</Link></div>
      <p className="text-sm text-[#aaa]">Track the books you have sent. Your most recent 100 gifts appear here.</p>
      {authLoading ? <LoadingSpinner /> : !firebaseUser ? <Link href="/login?redirect=%2Fgifts" className="button-primary inline-block rounded-xl px-5 py-3 text-sm">Sign in to see your gifts</Link> : <>
        <button onClick={refresh} className="text-sm text-[#f5b800] underline">Refresh gifts</button>
        {loading ? <LoadingSpinner /> : gifts.length === 0 && !error ? <div className="rounded-xl border border-[#292929] p-6 text-center"><Gift className="mx-auto text-[#f5b800] mb-3" /><p className="text-[#aaa] mb-4">Send your first book to someone you care about.</p><Link href="/browse" className="text-[#f5b800] underline">Find a book to gift</Link></div> : gifts.map(gift => <article key={gift.id} className="rounded-xl border border-[#292929] bg-[#111] p-5 space-y-3">
          <div className="flex justify-between gap-4"><h2 className="text-lg text-white">{gift.bookTitle}</h2><span className="text-[#f5b800] text-sm shrink-0">{centsToDisplay(gift.price)}</span></div>
          <p className="text-sm text-[#aaa] break-all">To: {gift.recipientEmail}</p>
          <p className={`text-sm ${gift.status === 'claimed' ? 'text-green-400' : 'text-[#f5b800]'}`}>{statusLabels[gift.status]}</p>
          <p className="text-xs text-[#888]">Created {new Date(gift.createdAt).toLocaleDateString()}{gift.claimedAt ? ` · Claimed ${new Date(gift.claimedAt).toLocaleDateString()}` : ''}</p>
          {gift.status === 'available' && <>
            <p className="text-xs text-[#aaa]">{emailLabels[gift.emailStatus]}</p>
            <div className="flex flex-wrap gap-4"><button disabled={!!busy} onClick={() => act(gift, 'link')} className="text-sm text-[#f5b800] underline disabled:opacity-60">Copy claim link</button>{['pending', 'failed'].includes(gift.emailStatus) && <button disabled={!!busy} onClick={() => act(gift, 'retry_email')} className="text-sm text-[#f5b800] underline disabled:opacity-60">Retry gift email</button>}</div>
            {share?.id === gift.id && <label className="block text-xs text-[#aaa]">Claim link<input readOnly value={share.url} onFocus={e => e.target.select()} className="field-input block w-full mt-2 rounded-lg px-3 py-2 text-xs" /></label>}
          </>}
          {gift.status === 'pending' && <p className="text-xs text-[#aaa]">If you already paid, wait for confirmation. Resume the same checkout if your payment was interrupted.</p>}
          <div className="flex flex-wrap gap-4 text-sm"><Link href={`/checkout/receipt?orders=${gift.orderId}`} className="text-[#aaa] underline">View receipt</Link>{gift.status === 'pending' && <Link href={`/gift/${gift.bookId}?resume=${gift.id}`} className="text-[#f5b800] underline">Resume checkout</Link>}</div>
        </article>)}
      </>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="text-sm text-[#aaa]">{notice}</p>}
    </main>
  </div>;
}
