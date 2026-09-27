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
import type { Subscription } from '@/types/subscription';

export default function AdminSubscriptionsPage() {
  const {
    data: subscriptions,
    loading,
    error,
    retry,
  } = useAdminCollection<Subscription>('subscriptions');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [plan, setPlan] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const active = subscriptions.filter((item) => item.status === 'active');
  const filtered = subscriptions
    .filter(
      (item) =>
        (status === 'all' || item.status === status) &&
        (plan === 'all' || item.plan === plan) &&
        [item.userDisplayName, item.userId, item.stripeSubscriptionId].some((value) =>
          value?.toLowerCase().includes(search.trim().toLowerCase()),
        ),
    )
    .sort((a, b) => dateValue(b.startDate) - dateValue(a.startDate));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15)));
  const subscription = subscriptions.find((item) => item.id === selected);
  return (
    <main className="admin-page">
      <AdminHeading
        title="Subscriptions"
        description="Existing billing records and renewal status. New subscription purchases are currently unavailable."
      />
      <AdminError error={error} retry={retry} />
      {loading ? (
        <p role="status" className="admin-empty">
          Loading subscriptions…
        </p>
      ) : (
        !error && (
          <>
            <dl className="admin-metrics">
              {[
                [
                  'Active plan value',
                  centsToDisplay(active.reduce((sum, item) => sum + (item.price ?? 0), 0)),
                  'Monthly prices of active records',
                ],
                ['Active subscribers', active.length.toString(), 'Current subscriptions'],
                [
                  'Past due',
                  subscriptions.filter((item) => item.status === 'past_due').length.toString(),
                  'Billing needs attention',
                ],
                [
                  'Ending subscriptions',
                  active.filter((item) => item.cancelAtPeriodEnd).length.toString(),
                  'Cancel at the current period end',
                ],
              ].map(([label, value, hint]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                  <small>{hint}</small>
                </div>
              ))}
            </dl>
            <div className="admin-toolbar">
              <AdminSearch
                label="Search subscriber or Stripe ID"
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
              />
              <select
                aria-label="Subscription plan"
                value={plan}
                onChange={(event) => {
                  setPlan(event.target.value);
                  setPage(1);
                }}
              >
                {['all', 'basic', 'standard', 'premium'].map((value) => (
                  <option key={value} value={value}>
                    {value === 'all' ? 'All plans' : value}
                  </option>
                ))}
              </select>
              <select
                aria-label="Subscription status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                {['all', 'active', 'cancelled', 'past_due'].map((value) => (
                  <option key={value} value={value}>
                    {value === 'all' ? 'All statuses' : value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <section className="admin-panel">
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Subscriber</th>
                      <th>Plan</th>
                      <th>Monthly price</th>
                      <th>Period ends</th>
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
                            {item.userDisplayName || 'Subscriber'}
                          </button>
                          <small>{item.userId}</small>
                        </td>
                        <td className="capitalize">{item.plan}</td>
                        <td>{centsToDisplay(item.price ?? 0)}</td>
                        <td className="admin-muted">
                          {dateValue(item.currentPeriodEnd)
                            ? new Date(dateValue(item.currentPeriodEnd)).toLocaleDateString()
                            : 'Unknown'}
                          {item.cancelAtPeriodEnd && <small>Cancellation scheduled</small>}
                        </td>
                        <td>
                          <AdminBadge
                            tone={
                              item.status === 'active'
                                ? 'good'
                                : item.status === 'past_due'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {item.status.replaceAll('_', ' ')}
                          </AdminBadge>
                        </td>
                      </tr>
                    ))}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={5} className="admin-empty">
                          No subscriptions match this view.
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
      {subscription && (
        <AdminDrawer title="Subscription details" onClose={() => setSelected(null)}>
          <h3 className="text-xl font-semibold">{subscription.userDisplayName}</h3>
          <p className="text-[#a6afa3] mt-2 capitalize">
            {subscription.plan} · {centsToDisplay(subscription.price ?? 0)} / month
          </p>
          <div className="mt-4">
            <AdminBadge>{subscription.status.replaceAll('_', ' ')}</AdminBadge>
          </div>
          <dl>
            <div>
              <dt>Started</dt>
              <dd>
                {dateValue(subscription.startDate)
                  ? new Date(dateValue(subscription.startDate)).toLocaleDateString()
                  : 'Unknown'}
              </dd>
            </div>
            <div>
              <dt>Period ends</dt>
              <dd>
                {dateValue(subscription.currentPeriodEnd)
                  ? new Date(dateValue(subscription.currentPeriodEnd)).toLocaleDateString()
                  : 'Unknown'}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-[#a6afa3]">
            {subscription.cancelAtPeriodEnd
              ? 'This subscription is scheduled to end at the current period boundary.'
              : 'Billing is managed through Stripe.'}
          </p>
          {subscription.stripeSubscriptionId && (
            <a
              href={
                'https://dashboard.stripe.com/subscriptions/' +
                encodeURIComponent(subscription.stripeSubscriptionId)
              }
              target="_blank"
              rel="noopener noreferrer"
              className="admin-secondary mt-6"
            >
              Review subscription in Stripe ↗
            </a>
          )}
        </AdminDrawer>
      )}
    </main>
  );
}
