'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAdminCollection } from '@/lib/admin/useAdminCollection';
import { dateValue, salesSummary } from '@/lib/admin/metrics';
import { downloadCsv } from '@/lib/admin/csv';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import {
  AdminHeading,
  AdminSearch,
  AdminPagination,
  AdminDrawer,
  AdminError,
  AdminBadge,
} from '@/components/admin/AdminUI';
import type { Order } from '@/types/order';

export default function AdminRevenuePage() {
  const { data: orders, loading, error, retry } = useAdminCollection<Order>('orders');
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const now = new Date();
  const summary = salesSummary(orders, days, now);
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  since.setDate(since.getDate() - days + 1);
  const filtered = orders
    .filter(
      (order) =>
        dateValue(order.createdAt) >= since.getTime() &&
        dateValue(order.createdAt) <= now.getTime() &&
        (status === 'all' || order.status === status) &&
        [order.bookTitle, order.buyerEmail, order.id, order.stripePaymentIntentId].some((value) =>
          value?.toLowerCase().includes(search.trim().toLowerCase()),
        ),
    )
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15)));
  const order = orders.find((item) => item.id === selected);
  const reviews = orders.filter((item) => item.status === 'needs_review');
  function exportOrders() {
    downloadCsv('afrobooks-orders-' + now.toISOString().slice(0, 10) + '.csv', [
      [
        'Order',
        'Book',
        'Status',
        'Date',
        'Customer paid USD',
        'Counted platform earnings USD',
        'Counted author earnings USD',
        'Estimated processing USD',
        'Stripe payment',
      ],
      ...filtered.map((item) => [
        item.id,
        item.bookTitle,
        item.status,
        new Date(dateValue(item.createdAt)).toISOString(),
        (item.finalPrice / 100).toFixed(2),
        ((item.status === 'completed' ? item.platformFee ?? 0 : 0) / 100).toFixed(2),
        ((item.status === 'completed' ? item.sellerEarnings ?? 0 : 0) / 100).toFixed(2),
        ((item.stripeFee ?? 0) / 100).toFixed(2),
        item.stripePaymentIntentId,
      ]),
    ]);
  }
  return (
    <main className="admin-page">
      <AdminHeading
        title="Revenue"
        description="Understand book sales, your platform share, and author earnings. Financial totals include completed orders only."
      >
        <select
          aria-label="Revenue date range"
          value={days}
          onChange={(event) => {
            setDays(Number(event.target.value));
            setPage(1);
          }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </AdminHeading>
      <AdminError error={error} retry={retry} />
      {loading ? (
        <p className="admin-empty" role="status">
          Loading revenue…
        </p>
      ) : (
        !error && (
          <>
            {reviews.length > 0 && (
              <section className="admin-panel mb-6">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Payments needing review</h2>
                    <p>All dates · These payments did not grant book access or author earnings.</p>
                  </div>
                  <AdminBadge tone="warning">{reviews.length} open</AdminBadge>
                </div>
                {reviews.map((item) => (
                  <div className="admin-queue-row" key={item.id}>
                    <div>
                      <button
                        type="button"
                        className="admin-row-title"
                        onClick={() => setSelected(item.id)}
                      >
                        {item.bookTitle}
                      </button>
                      <small>{item.stripePaymentIntentId}</small>
                    </div>
                    <span>{centsToDisplay(item.finalPrice)}</span>
                  </div>
                ))}
              </section>
            )}
            <dl className="admin-metrics">
              {[
                [
                  'Book sales',
                  centsToDisplay(summary.gross),
                  'Customer payments for completed orders',
                ],
                [
                  'Platform earnings',
                  centsToDisplay(summary.platform),
                  'Before other business costs',
                ],
                [
                  'Author earnings',
                  centsToDisplay(summary.royalties),
                  'Royalties earned, not confirmed bank payouts',
                ],
                ['Books sold', summary.count.toLocaleString(), 'Individual book orders'],
              ].map(([label, value, hint]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                  <small>{hint}</small>
                </div>
              ))}
            </dl>
            <section className="admin-panel mb-6">
              <div className="admin-panel-heading">
                <div>
                  <h2>Sales over time</h2>
                  <p>USD · Includes days with no sales</p>
                </div>
              </div>
              {summary.count ? (
                <div className="h-[260px] px-3 pb-5">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={summary.series} margin={{ right: 20 }}>
                      <CartesianGrid vertical={false} stroke="#30352f" />
                      <XAxis
                        dataKey="date"
                        minTickGap={40}
                        tick={{ fill: '#a6afa3', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => '$' + value / 100}
                        tick={{ fill: '#a6afa3', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#20271e',
                          border: '1px solid #49523f',
                          borderRadius: 8,
                        }}
                        formatter={(value: number) => [centsToDisplay(value), 'Book sales']}
                      />
                      <Area
                        isAnimationActive={false}
                        dataKey="gross"
                        type="monotone"
                        stroke="#d8edb2"
                        fill="#d8edb2"
                        fillOpacity={0.12}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="admin-empty">No completed book sales during this period.</div>
              )}
            </section>
            <div className="admin-toolbar">
              <AdminSearch
                label="Search book, buyer, or payment ID"
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
              />
              <select
                aria-label="Order status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                {['all', 'completed', 'pending', 'refunded', 'disputed', 'needs_review'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value === 'all' ? 'All statuses' : value.replaceAll('_', ' ')}
                    </option>
                  ),
                )}
              </select>
              <button
                type="button"
                className="admin-secondary"
                disabled={!filtered.length}
                onClick={exportOrders}
              >
                <Download size={15} />
                Export CSV
              </button>
            </div>
            <section className="admin-panel">
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Book / buyer</th>
                      <th>Date</th>
                      <th>Customer paid</th>
                      <th>Platform share</th>
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
                            {item.bookTitle}
                          </button>
                          <small>{item.buyerEmail}</small>
                        </td>
                        <td className="admin-muted">
                          {new Date(dateValue(item.createdAt)).toLocaleDateString()}
                        </td>
                        <td>{centsToDisplay(item.finalPrice)}</td>
                        <td>
                          {item.status === 'completed'
                            ? centsToDisplay(item.platformFee ?? 0)
                            : '—'}
                        </td>
                        <td>
                          <AdminBadge tone={item.status === 'completed' ? 'good' : 'warning'}>
                            {item.status.replaceAll('_', ' ')}
                          </AdminBadge>
                        </td>
                      </tr>
                    ))}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={5} className="admin-empty">
                          No orders match this period and filters.
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
      {order && (
        <AdminDrawer title="Order details" onClose={() => setSelected(null)}>
          <h3 className="text-xl font-semibold">{order.bookTitle}</h3>
          <p className="text-[#a6afa3] mt-2">{order.buyerEmail}</p>
          <div className="mt-4">
            <AdminBadge tone={order.status === 'completed' ? 'good' : 'warning'}>
              {order.status.replaceAll('_', ' ')}
            </AdminBadge>
          </div>
          <dl>
            {order.refundStatus && <div>
              <dt>Payment refund</dt>
              <dd>{order.refundStatus} — {centsToDisplay(order.paymentRefundedAmount ?? 0)} refunded across this payment</dd>
            </div>}
            <div>
              <dt>Customer paid</dt>
              <dd>{centsToDisplay(order.finalPrice)}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>{centsToDisplay(order.discountAmount ?? 0)}</dd>
            </div>
            <div>
              <dt>Platform earnings</dt>
              <dd>
                {order.status === 'completed'
                  ? centsToDisplay(order.platformFee ?? 0)
                  : 'Not counted'}
              </dd>
            </div>
            <div>
              <dt>Author earnings</dt>
              <dd>
                {order.status === 'completed'
                  ? centsToDisplay(order.sellerEarnings ?? 0)
                  : 'Not counted'}
              </dd>
            </div>
            <div>
              <dt>Estimated processing</dt>
              <dd>{centsToDisplay(order.stripeFee ?? 0)}</dd>
            </div>
          </dl>
          <p className="text-xs text-[#a6afa3]">Order ID: {order.id}</p>
          <p className="text-xs text-[#a6afa3] mt-2">Payment ID: {order.stripePaymentIntentId}</p>
          {order.stripePaymentIntentId && (
            <a
              className="admin-secondary mt-6"
              href={
                'https://dashboard.stripe.com/payments/' +
                encodeURIComponent(order.stripePaymentIntentId)
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Review payment in Stripe ↗
            </a>
          )}
        </AdminDrawer>
      )}
    </main>
  );
}
