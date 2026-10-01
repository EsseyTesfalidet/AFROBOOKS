'use client';

import { useState } from 'react';
import { useAdminCollection } from '@/lib/admin/useAdminCollection';
import { dateValue } from '@/lib/admin/metrics';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import {
  AdminHeading,
  AdminSearch,
  AdminPagination,
  AdminDrawer,
  AdminError,
  AdminBadge,
} from '@/components/admin/AdminUI';
import type { Payout } from '@/types/order';
import SettlementReviewButton from '@/components/admin/SettlementReviewButton';

const reasons: Record<string, string> = {
  account_mismatch: 'Stripe account ownership needs review',
  payment_review: 'A payment, refund, or dispute needs review',
  balance_mismatch: 'Author balance does not match the order ledger',
  legacy_payout_review: 'Historical payout records need reconciliation',
  transfer_mismatch: 'Stripe transfer does not match the recorded payout',
  unrecorded_transfer: 'A Stripe transfer is missing from the ledger',
  transfer_review: 'An earlier transfer attempt needs confirmation',
};
export default function AdminPayoutsPage() {
  const payouts = useAdminCollection<Payout & { orderId?: string; stripePaymentIntentId?: string }>(
    'payouts',
  );
  const reviews = useAdminCollection<{ sellerId: string; reason: string; status: string; retainedFeeCents?: number; resolvedAt?: unknown }>(
    'payoutReviews',
  );
  const settings = useAdminCollection<{ automatedPayoutsEnabled?: boolean }>('platformSettings');
  const people = useAdminCollection<{ firstName?: string; lastName?: string }>('users');
  const sources = [payouts, reviews, settings, people];
  const loading = sources.some((source) => source.loading);
  const error = sources.find((source) => source.error)?.error ?? '';
  const enabled =
    settings.data.find((item) => item.id === 'global')?.automatedPayoutsEnabled === true;
  const authorName = (id: string, fallback?: string) => {
    const person = people.data.find((item) => item.id === id);
    return person ? [person.firstName, person.lastName].filter(Boolean).join(' ') : fallback || id;
  };
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState('');
  const filtered = payouts.data
    .filter(
      (item) =>
        (status === 'all' || item.status === status) &&
        [authorName(item.sellerId, item.sellerName), item.id, item.stripeTransferId].some((value) =>
          value?.toLowerCase().includes(search.trim().toLowerCase()),
        ),
    )
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15)));
  const payout = payouts.data.find((item) => item.id === selected);
  const openReviews = reviews.data.filter((item) => item.status === 'open');
  const resolvedReviews = reviews.data.filter(item => item.status === 'resolved').sort((a, b) => dateValue(b.resolvedAt) - dateValue(a.resolvedAt)).slice(0, 10);
  return (
    <main className="admin-page">
      <AdminHeading
        title="Author payouts"
        description="Track book royalties sent to Stripe and investigate exceptions. Bank arrival follows each author’s Stripe payout schedule."
      >
        {!loading && !error && (
          <AdminBadge tone={enabled ? 'good' : 'warning'}>
            {enabled ? 'Automatic transfers enabled' : 'Automatic transfers paused'}
          </AdminBadge>
        )}
      </AdminHeading>
      <AdminError
        error={error}
        retry={() => sources.filter((source) => source.error).forEach((source) => source.retry())}
      />
      {loading ? (
        <p className="admin-empty" role="status">
          Loading author payouts…
        </p>
      ) : (
        !error && (
          <>
            <dl className="admin-metrics">
              {[
                [
                  'Transferred to Stripe',
                  centsToDisplay(
                    payouts.data
                      .filter((item) => item.status === 'paid')
                      .reduce((sum, item) => sum + item.amountCents, 0),
                  ),
                  'Confirmed transfers across all dates',
                ],
                [
                  'Reserved / pending',
                  centsToDisplay(
                    payouts.data
                      .filter((item) =>
                        ['pending', 'processing', 'needs_review'].includes(item.status),
                      )
                      .reduce((sum, item) => sum + item.amountCents, 0),
                  ),
                  'Reserved royalties, including holds',
                ],
                ['Open reviews', openReviews.length.toString(), 'Authors awaiting reconciliation'],
                [
                  'Transfer records',
                  payouts.data.length.toString(),
                  'One record for each book royalty',
                ],
              ].map(([label, value, hint]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                  <small>{hint}</small>
                </div>
              ))}
            </dl>
            {reviewMessage && <p role="status" className="mb-4 text-sm text-[#c5c9c2]">{reviewMessage}</p>}
            {openReviews.length > 0 && (
              <section className="admin-panel mb-6">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Needs financial review</h2>
                    <p>Check Stripe to clear resolved holds. This action does not issue refunds or move money.</p>
                  </div>
                  <AdminBadge tone="warning">{openReviews.length} open</AdminBadge>
                </div>
                {openReviews.map((review) => (
                  <div key={review.id} className="admin-queue-row">
                    <div>
                      <p>{authorName(review.sellerId)}</p>
                      <small>{reasons[review.reason] ?? review.reason.replaceAll('_', ' ')}</small>
                      <small>Author ID: {review.sellerId}</small>
                    </div>
                    <SettlementReviewButton sellerId={review.sellerId} onResult={setReviewMessage} />
                  </div>
                ))}
              </section>
            )}
            {resolvedReviews.length > 0 && <section className="admin-panel mb-6">
              <div className="admin-panel-heading"><div><h2>Recently settled</h2><p>Verified reviews that no longer block new purchases.</p></div></div>
              {resolvedReviews.map(review => <div key={review.id} className="admin-queue-row">
                <div><p>{authorName(review.sellerId)}</p><small>{dateValue(review.resolvedAt) ? new Date(dateValue(review.resolvedAt)).toLocaleString() : 'Settlement recorded'}</small>
                  {!!review.retainedFeeCents && <small>Platform fees retained in Stripe: {centsToDisplay(review.retainedFeeCents)}</small>}
                </div><AdminBadge tone="good">Settled</AdminBadge>
              </div>)}
            </section>}
            <div className="admin-toolbar">
              <AdminSearch
                label="Search author or transfer ID"
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
              />
              <select
                aria-label="Payout status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                {['all', 'paid', 'reversed', 'pending', 'processing', 'needs_review', 'failed'].map((value) => (
                  <option value={value} key={value}>
                    {value === 'all'
                      ? 'All statuses'
                      : value === 'paid'
                        ? 'Transferred to Stripe'
                        : value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <section className="admin-panel">
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Author</th>
                      <th>Royalty</th>
                      <th>Created</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((currentPage - 1) * 15, currentPage * 15).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <button
                            type="button"
                            className="admin-row-title"
                            onClick={() => setSelected(item.id)}
                          >
                            {authorName(item.sellerId, item.sellerName)}
                          </button>
                          <small>{item.id}</small>
                        </td>
                        <td>{centsToDisplay(item.amountCents)}</td>
                        <td className="admin-muted">
                          {dateValue(item.createdAt)
                            ? new Date(dateValue(item.createdAt)).toLocaleDateString()
                            : item.periodLabel}
                        </td>
                        <td>
                          <AdminBadge tone={item.status === 'paid' ? 'good' : 'warning'}>
                            {item.status === 'paid'
                              ? 'Transferred to Stripe'
                              : item.status.replaceAll('_', ' ')}
                          </AdminBadge>
                        </td>
                      </tr>
                    ))}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={4} className="admin-empty">
                          No payout records match this view.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <AdminPagination page={currentPage} total={filtered.length} onChange={setPage} />
            </section>
          </>
        )
      )}
      {payout && (
        <AdminDrawer title="Royalty details" onClose={() => setSelected(null)}>
          <h3 className="text-xl font-semibold">
            {authorName(payout.sellerId, payout.sellerName)}
          </h3>
          <p className="text-3xl my-5">{centsToDisplay(payout.amountCents)}</p>
          <AdminBadge tone={payout.status === 'paid' ? 'good' : 'warning'}>
            {payout.status === 'paid'
              ? 'Transferred to Stripe'
              : payout.status.replaceAll('_', ' ')}
          </AdminBadge>
          <dl>
            {!!payout.retainedApplicationFeeCents && <div><dt>Platform fee retained after refund</dt><dd>{centsToDisplay(payout.retainedApplicationFeeCents)}</dd></div>}
            <div>
              <dt>Order</dt>
              <dd>{payout.orderId ?? 'Historical payout'}</dd>
            </div>
            <div>
              <dt>Transfer date</dt>
              <dd>
                {dateValue(payout.paidAt)
                  ? new Date(dateValue(payout.paidAt)).toLocaleDateString()
                  : 'Not confirmed'}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-[#a6afa3]">
            A confirmed transfer moves earnings to the author’s Stripe balance. It does not confirm
            arrival at their bank.
          </p>
          <p className="text-xs mt-5 text-[#a6afa3]">Stripe account: {payout.stripeAccountId}</p>
          {payout.stripeTransferId && (
            <a
              className="admin-secondary mt-6"
              href={
                'https://dashboard.stripe.com/connect/transfers/' +
                encodeURIComponent(payout.stripeTransferId)
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Review transfer in Stripe ↗
            </a>
          )}
        </AdminDrawer>
      )}
    </main>
  );
}
