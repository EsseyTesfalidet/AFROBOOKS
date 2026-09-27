'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Megaphone } from 'lucide-react';
import { AdminDrawer } from '@/components/admin/AdminUI';
import BookCover from '@/components/shared/BookCover';
import { authenticatedGet, authenticatedPost } from '@/lib/firebase/request';
import { useAuthStore } from '@/store/authStore';
import {
  promotionIsOpen,
  promotionLabel,
  promotionPrice,
  PROMOTION_TERMS,
  PROMOTION_TERMS_VERSION,
} from '@/lib/promotions';
import type { Promotion, PromotionWorkspace as Workspace } from '@/types/promotion';
import './promotions.css';

const date = (value: number) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Not started';
export default function PromotionWorkspace({ admin = false }: { admin?: boolean }) {
  const uid = useAuthStore((state) => state.userProfile?.uid);
  const [result, setResult] = useState<{ uid: string; data: Workspace } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bookId, setBookId] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('all');
  const [price, setPrice] = useState('0.00');
  const [enabled, setEnabled] = useState(true);
  const data = result && result.uid === uid ? result.data : null;
  const selected = data?.campaigns.find((item) => item.id === selectedId);
  const load = useCallback(
    async (cursor?: string) => {
      if (!uid) return;
      setLoading(true);
      try {
        const response = await authenticatedGet<Workspace>(
          `/api/promotions?scope=${admin ? 'admin' : 'author'}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        );
        setResult((previous) => ({
          uid,
          data: {
            ...response,
            campaigns:
              cursor && previous?.uid === uid
                ? [
                    ...previous.data.campaigns,
                    ...response.campaigns.filter(
                      (item) => !previous.data.campaigns.some((old) => old.id === item.id),
                    ),
                  ]
                : response.campaigns,
            books:
              cursor && previous?.uid === uid
                ? [
                    ...new Map(
                      [...previous.data.books, ...response.books].map((book) => [book.id, book]),
                    ).values(),
                  ]
                : response.books,
          },
        }));
        setError('');
        if (!cursor) {
          setPrice((response.settings.priceCents / 100).toFixed(2));
          setEnabled(response.settings.enabled);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Unable to load promotions.');
      } finally {
        setLoading(false);
      }
    },
    [uid, admin],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get('payment');
    if (payment === 'received')
      setNotice(
        'Checkout returned. Your campaign starts only after Stripe confirms payment. Refresh to see the latest status.',
      );
    if (payment === 'cancelled')
      setNotice('Checkout closed. You can return to payment from your approved campaign.');
  }, []);
  async function perform(body: Record<string, unknown>, message: string, close = true) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await authenticatedPost<{ url?: string }>('/api/promotions', body);
      if (response.url) {
        const url = new URL(response.url);
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com')
          throw new Error('The checkout address could not be verified.');
        window.location.assign(url.href);
        return;
      }
      if (close) setSelectedId(null);
      if (body.action === 'submit') {
        setBookId('');
        setAccepted(false);
      }
      setNotice(message);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update the promotion.');
    } finally {
      setBusy(false);
    }
  }
  const eligibleBooks =
    data?.books.filter(
      (book) =>
        book.status === 'live' &&
        book.coverUrl.trim() &&
        !data.campaigns.some((item) => item.bookId === book.id && promotionIsOpen(item)),
    ) ?? [];
  const selectedBook = data?.books.find((book) => book.id === selected?.bookId);
  const previewBook = data?.books.find((book) => book.id === bookId);
  const filtered =
    data?.campaigns.filter(
      (item) =>
        filter === 'all' ||
        (filter === 'active' ? promotionLabel(item) === 'Running' : item.status === filter),
    ) ?? [];
  return (
    <main className="promotion-workspace">
      <header className="promotion-heading">
        <div>
          <p className="promotion-eyebrow">
            {admin ? 'Campaign manager' : 'Author studio · Promotions'}
          </p>
          <h1>{admin ? 'Book promotions' : 'Give your story a little more space.'}</h1>
          <p>
            {admin
              ? 'Review book placements, follow reader interest, and control the offer.'
              : 'Put your book in front of readers exploring Discover. A simple offer, with room for every voice.'}
          </p>
        </div>
        <Megaphone size={30} className="text-[#d8c2a2] shrink-0" aria-hidden="true" />
      </header>
      {notice && (
        <p className="promotion-notice" role="status">
          {notice}
        </p>
      )}
      {error && !selected && (
        <p className="promotion-error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => void load()} disabled={loading || busy}>
            Try again
          </button>
        </p>
      )}
      {loading && !data && (
        <p role="status" className="py-12 text-sm text-[#a8a49c]">
          Loading promotions…
        </p>
      )}
      {data && (
        <>
          <section className="promotion-offer">
            <div>
              <span className="promotion-eyebrow">Discover placement</span>
              <h2>
                {promotionPrice(data.settings.priceCents)} <span>/ 7 days</span>
              </h2>
              <p>
                A clearly labeled spot among shared book promotions. The offer is fixed when an
                author submits.
              </p>
            </div>
            <dl>
              <div>
                <dt>Placement</dt>
                <dd>Discover only</dd>
              </div>
              <div>
                <dt>Billing</dt>
                <dd>{data.settings.priceCents ? 'Once, after approval' : 'No payment required'}</dd>
              </div>
              <div>
                <dt>Submissions</dt>
                <dd>{data.settings.enabled ? 'Open' : 'Paused'}</dd>
              </div>
            </dl>
          </section>
          {admin ? (
            <details className="promotion-form">
              <summary>Offer settings</summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    !/^\d+(\.\d{1,2})?$/.test(price) ||
                    Number(price) > 1000 ||
                    (Number(price) > 0 && Number(price) < 1)
                  ) {
                    setError('Enter $0 for the pilot, or $1–$1,000 with up to two decimal places.');
                    return;
                  }
                  void perform(
                    { action: 'settings', priceCents: Math.round(Number(price) * 100), enabled },
                    'Offer saved. Existing campaign prices are unchanged.',
                  );
                }}
              >
                <label>
                  Price for seven days (USD)
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.01"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    required
                  />
                </label>
                <p className="promotion-help">
                  Start at $0 while you learn how much traffic a placement receives. Paid offers use
                  Stripe; promotion revenue is separate from author royalties. Stripe processing
                  fees reduce your net revenue.
                </p>
                <label className="promotion-check">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setEnabled(event.target.checked)}
                  />
                  Accept new promotions
                </label>
                <p className="promotion-help">
                  Pausing submissions also pauses new checkouts. Already-paid campaigns finish their
                  scheduled run.
                </p>
                <button className="promotion-primary" disabled={busy || loading}>
                  Save offer
                </button>
              </form>
            </details>
          ) : (
            <details className="promotion-form" open={data.campaigns.length === 0 || undefined}>
              <summary>Promote a book</summary>
              {!data.settings.enabled ? (
                <p className="py-5 text-sm">
                  New promotions are paused. Your existing campaigns are still listed below.
                </p>
              ) : eligibleBooks.length === 0 ? (
                <p className="py-5 text-sm text-[#bbb5aa]">
                  You need a published book with a cover image and no open promotion.{' '}
                  <Link className="underline" href="/listings">
                    Manage your books
                  </Link>
                </p>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (accepted && bookId)
                      void perform(
                        {
                          action: 'submit',
                          bookId,
                          expectedPrice: data.settings.priceCents,
                          termsVersion: PROMOTION_TERMS_VERSION,
                        },
                        'Promotion submitted for review.',
                      );
                  }}
                >
                  <label>
                    Book
                    <select
                      aria-label="Book"
                      value={bookId}
                      required
                      onChange={(event) => setBookId(event.target.value)}
                    >
                      <option value="">Choose a published book</option>
                      {eligibleBooks.map((book) => (
                        <option key={book.id} value={book.id}>
                          {book.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {previewBook && (
                    <div className="promotion-preview">
                      <div className="w-16 shrink-0">
                        <BookCover book={previewBook} compact />
                      </div>
                      <div>
                        <span className="promotion-eyebrow">Sponsored · Preview</span>
                        <p className="mt-2 font-semibold">{previewBook.title}</p>
                        <p className="text-sm text-[#a8a49c]">{previewBook.authorName}</p>
                      </div>
                    </div>
                  )}
                  <p className="promotion-help">{PROMOTION_TERMS}</p>
                  <label className="promotion-check">
                    <input
                      type="checkbox"
                      checked={accepted}
                      required
                      onChange={(event) => setAccepted(event.target.checked)}
                    />
                    I agree to this offer: {promotionPrice(data.settings.priceCents)} for seven
                    days.
                  </label>
                  <button
                    className="promotion-primary"
                    disabled={
                      !accepted ||
                      !bookId ||
                      busy ||
                      loading ||
                      (data.settings.priceCents > 0 && !data.paymentsReady)
                    }
                  >
                    {busy ? 'Submitting…' : 'Submit for review'}
                  </button>
                  {data.settings.priceCents > 0 && !data.paymentsReady && (
                    <p role="status" className="promotion-help">
                      Paid promotions are temporarily unavailable.
                    </p>
                  )}
                </form>
              )}
            </details>
          )}
          <section className="promotion-campaigns">
            <div className="promotion-list-heading">
              <div>
                <h2>{admin ? 'Campaigns' : 'Your campaigns'}</h2>
                <p>
                  Reader views and clicks count each signed-in account once per day. Your own visits
                  are excluded.
                </p>
              </div>
              <button type="button" onClick={() => void load()} disabled={loading || busy}>
                Refresh
              </button>
            </div>
            <label className="promotion-filter">
              Status
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="all">All campaigns</option>
                <option value="pending">In review</option>
                <option value="approved">Ready for payment</option>
                <option value="active">Running</option>
                <option value="needs_review">Payment review</option>
              </select>
            </label>
            {filtered.length === 0 && (
              <div className="promotion-empty">
                <Megaphone size={26} aria-hidden="true" />
                <h3>
                  {data.campaigns.length
                    ? 'No campaigns in this view.'
                    : 'Your next chapter can start here.'}
                </h3>
                <p>
                  {admin
                    ? 'Author requests will appear here for review.'
                    : 'Submit a book above. Once approved, it can appear in Discover.'}
                </p>
              </div>
            )}
            {filtered.map((item) => {
              const book = data.books.find((book) => book.id === item.bookId);
              return (
                <button
                  className="promotion-row"
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setNote('');
                    setError('');
                  }}
                >
                  <div className="w-12 shrink-0">
                    {book ? (
                      <BookCover book={book} compact />
                    ) : (
                      <div className="aspect-[2/3] rounded bg-white/5" />
                    )}
                  </div>
                  <div className="promotion-row-title">
                    <h3>{book?.title ?? 'Book unavailable'}</h3>
                    <p>
                      {item.deliveryIssue ? 'Not showing — review needed' : promotionLabel(item)} ·{' '}
                      {promotionPrice(item.priceCents)}
                    </p>
                    <span>
                      {item.startsAt
                        ? `${date(item.startsAt)} – ${date(item.endsAt)}`
                        : `Submitted ${date(item.createdAt)}`}
                    </span>
                  </div>
                  <div className="promotion-row-stats">
                    <span>
                      <strong>{item.views.toLocaleString()}</strong>reader views
                    </span>
                    <span>
                      <strong>{item.clicks.toLocaleString()}</strong>reader clicks
                    </span>
                  </div>
                  <ArrowUpRight size={18} aria-hidden="true" className="shrink-0" />
                </button>
              );
            })}
            <div className="promotion-list-footer">
              <span>
                {data.campaigns.length} campaigns loaded
                {filter !== 'all' ? ' · Filter applies to loaded campaigns' : ''}
              </span>
              {data.hasMore && (
                <button
                  type="button"
                  disabled={loading || busy}
                  onClick={() => void load(data.nextCursor!)}
                >
                  {loading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          </section>
          <p className="promotion-help mt-6">
            Promotions appear separately from staff picks and personalized recommendations. Reader
            counts are approximate, exclude anonymous visits, and are never used for billing.{' '}
            <a
              className="underline"
              href="mailto:esseytesfa@gmail.com?subject=Book%20promotion%20support"
            >
              Contact support
            </a>
          </p>
        </>
      )}
      {selected && (
        <AdminDrawer title="Campaign details" busy={busy} onClose={() => setSelectedId(null)}>
          <div className="promotion-detail">
            {selectedBook && (
              <div className="promotion-preview">
                <div className="w-20 shrink-0">
                  <BookCover book={selectedBook} />
                </div>
                <div>
                  <h3>{selectedBook.title}</h3>
                  <p>{selectedBook.authorName}</p>
                  {selectedBook.status === 'live' && (
                    <Link
                      href={`/book/${selectedBook.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Review book <ArrowUpRight size={14} />
                    </Link>
                  )}
                </div>
              </div>
            )}
            <p className="promotion-eyebrow">{promotionLabel(selected)}</p>
            <h3>{promotionPrice(selected.priceCents)} · Seven days</h3>
            <p>
              {selected.startsAt
                ? `${date(selected.startsAt)} – ${date(selected.endsAt)}`
                : 'The seven-day period begins when the campaign is activated.'}
            </p>
            <dl className="promotion-detail-stats">
              <div>
                <dt>Reader views</dt>
                <dd>{selected.views.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Reader clicks</dt>
                <dd>{selected.clicks.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Click rate</dt>
                <dd>
                  {selected.views
                    ? `${((selected.clicks / selected.views) * 100).toFixed(1)}%`
                    : '—'}
                </dd>
              </div>
            </dl>
            {selected.note && <p className="promotion-notice">{selected.note}</p>}
            {selected.deliveryIssue && <p className="promotion-error">{selected.deliveryIssue}</p>}
            {(!selectedBook || selectedBook.status !== 'live') && (
              <p className="promotion-error">
                This book is unavailable. Its promotion cannot be shown.
              </p>
            )}
            {selected.status === 'needs_review' && (
              <p className="promotion-help">
                This campaign is not showing.{' '}
                {admin
                  ? 'Resolve its Stripe payment below. A successful paid checkout receives a full refund; an unpaid checkout is closed.'
                  : 'Contact support to review the payment. Include the campaign reference below.'}
              </p>
            )}
            {error && (
              <p role="alert" className="promotion-error">
                {error}
              </p>
            )}
            {admin && selected.status === 'pending' && (
              <>
                <label>
                  Review note
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Required when declining a campaign"
                  />
                </label>
                <div className="promotion-actions">
                  <button
                    className="promotion-primary"
                    disabled={busy}
                    onClick={() =>
                      void perform(
                        { action: 'approve', id: selected.id, note },
                        selected.priceCents
                          ? 'Approved. The author can now pay.'
                          : 'Approved. The free campaign is running.',
                      )
                    }
                  >
                    Approve campaign
                  </button>
                  <button
                    disabled={busy || !note.trim()}
                    onClick={() =>
                      void perform(
                        { action: 'reject', id: selected.id, note },
                        'Campaign declined.',
                      )
                    }
                  >
                    Decline
                  </button>
                </div>
              </>
            )}
            {!admin && selected.status === 'approved' && (
              <button
                className="promotion-primary"
                disabled={busy || !data?.paymentsReady || !data.settings.enabled}
                onClick={() => void perform({ action: 'checkout', id: selected.id }, '')}
              >
                Pay {promotionPrice(selected.priceCents)} with Stripe
              </button>
            )}
            {admin && selected.status === 'needs_review' && (
              <button
                className="promotion-primary"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Resolve this campaign payment? Any completed charge will be refunded in full. An unpaid checkout will be closed.',
                    )
                  )
                    void perform(
                      { action: 'resolve_payment', id: selected.id },
                      'Payment resolution saved. Pending refunds may take time to update.',
                    );
                }}
              >
                Resolve payment / full refund
              </button>
            )}
            {['pending', 'approved', 'active'].includes(selected.status) &&
              promotionLabel(selected) !== 'Completed' && (
                <button
                  className="promotion-stop"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Stop this promotion? It will disappear from Discover. Any payment will be sent for review.',
                      )
                    )
                      void perform(
                        {
                          action: 'stop',
                          id: selected.id,
                          note: admin
                            ? 'Stopped by an administrator. Contact support for details.'
                            : 'Stopped by the author.',
                        },
                        'Campaign stopped.',
                      );
                  }}
                >
                  Stop promotion
                </button>
              )}
            {admin && selected.paymentIntentId && (
              <a
                className="promotion-stripe-link"
                href={`https://dashboard.stripe.com/payments/${encodeURIComponent(selected.paymentIntentId)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View payment in Stripe <ArrowUpRight size={14} />
              </a>
            )}
            <p className="promotion-help">{PROMOTION_TERMS}</p>
            <p className="promotion-reference">
              Campaign: {selected.id}
              {admin && (
                <>
                  <br />
                  Author: {selected.sellerId}
                </>
              )}
            </p>
          </div>
        </AdminDrawer>
      )}
    </main>
  );
}
