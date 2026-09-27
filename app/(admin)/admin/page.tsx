'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { ArrowUpRight } from 'lucide-react';
import { AdminHeading, AdminError, AdminBadge } from '@/components/admin/AdminUI';
import { useAdminCollection } from '@/lib/admin/useAdminCollection';
import { salesSummary, dateValue } from '@/lib/admin/metrics';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';
import type { User } from '@/types/user';
import type { Order } from '@/types/order';
import type { Report } from '@/types/review';

export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const books = useAdminCollection<Book>('books');
  const users = useAdminCollection<User>('users');
  const orders = useAdminCollection<Order>('orders');
  const reports = useAdminCollection<Report>('reports');
  const sellers = useAdminCollection<{ stripeAccountStatus?: string }>('sellers');
  const verifications = useAdminCollection<{ status: string }>('verificationRequests');
  const reviews = useAdminCollection<{ status: string }>('payoutReviews');
  const sources = [books, users, orders, reports, sellers, verifications, reviews];
  const loading = sources.some((source) => source.loading);
  const error = sources.find((source) => source.error)?.error ?? '';
  const summary = salesSummary(orders.data, days);
  const live = books.data.filter((book) => book.status === 'live').length;
  const recent = [...orders.data]
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt))
    .slice(0, 5);
  const queues = [
    {
      label: 'Books awaiting review',
      count: books.data.filter((book) => book.status === 'in_review').length,
      href: '/admin/books',
      hint: 'Publishing and rights declarations',
    },
    {
      label: 'Flagged books',
      count: books.data.filter((book) => book.status === 'flagged').length,
      href: '/admin/flagged',
      hint: 'Content requiring moderation',
    },
    {
      label: 'Open reports',
      count: reports.data.filter((report) => report.status === 'open').length,
      href: '/admin/reports',
      hint: 'Reader and author concerns',
    },
    {
      label: 'Identity verifications',
      count: verifications.data.filter((request) => request.status === 'pending').length,
      href: '/admin/verifications',
      hint: 'Author documents to review',
    },
    {
      label: 'Payout exceptions',
      count: reviews.data.filter((review) => review.status === 'open').length,
      href: '/admin/payouts',
      hint: 'Financial reconciliation required',
    },
  ];
  return (
    <main className="admin-page">
      <AdminHeading
        title="Overview"
        description="A clear view of your bookstore, its earnings, and what needs your attention."
      >
        <select
          aria-label="Overview date range"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </AdminHeading>
      <AdminError
        error={error}
        retry={() => sources.filter((source) => source.error).forEach((source) => source.retry())}
      />
      {loading ? (
        <div className="admin-empty" role="status">
          Loading your bookstore overview…
        </div>
      ) : (
        !error && (
          <>
            <dl className="admin-metrics">
              {[
                ['Book sales', centsToDisplay(summary.gross), 'Completed orders in this period'],
                [
                  'Platform earnings',
                  centsToDisplay(summary.platform),
                  'After estimated processing · before other costs',
                ],
                [
                  'Books sold',
                  summary.count.toLocaleString(),
                  'Individual books, including cart purchases',
                ],
                ['Published books', live.toLocaleString(), 'Currently available in the catalog'],
              ].map(([label, value, hint]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                  <small>{hint}</small>
                </div>
              ))}
            </dl>
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)] gap-6 mb-6">
              <section className="admin-panel min-w-0">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Sales performance</h2>
                    <p>Completed book sales · USD</p>
                  </div>
                  <Link href="/admin/revenue" className="admin-link">
                    Revenue <ArrowUpRight size={13} className="inline" />
                  </Link>
                </div>
                {summary.count > 0 ? (
                  <div className="px-3 pb-6 h-[270px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={summary.series}
                        margin={{ left: 0, right: 20, top: 15, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="admin-sales-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#c5dda6" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#c5dda6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="#30352f" />
                        <XAxis
                          dataKey="date"
                          minTickGap={40}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#a6afa3', fontSize: 11 }}
                        />
                        <YAxis
                          tickFormatter={(value) => '$' + value / 100}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#a6afa3', fontSize: 11 }}
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
                          type="monotone"
                          dataKey="gross"
                          stroke="#d8edb2"
                          strokeWidth={2}
                          fill="url(#admin-sales-fill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="admin-empty h-[270px] grid place-content-center">
                    <p className="text-lg text-[#e0e6dc] mb-2">
                      Your next chapter starts with a sale
                    </p>
                    <p>Completed purchases will appear here.</p>
                    <p className="mt-3">No completed sales in the last {days} days.</p>
                  </div>
                )}
                <div className="border-t border-[#30352f] px-6 py-4 flex flex-wrap gap-x-8 gap-y-2 text-xs admin-muted">
                  <span>
                    Author earnings:{' '}
                    <strong className="text-[#e0e6dc]">{centsToDisplay(summary.royalties)}</strong>
                  </span>
                  <span>Transfers tracked separately in payouts</span>
                </div>
              </section>
              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Needs attention</h2>
                    <p>
                      {queues.reduce((sum, item) => sum + item.count, 0)} items across your review
                      queues
                    </p>
                  </div>
                </div>
                {queues.map((item) => (
                  <Link className="admin-queue-row" href={item.href} key={item.label}>
                    <div>
                      <p>{item.label}</p>
                      <small>{item.hint}</small>
                    </div>
                    <span>
                      {item.count} <ArrowUpRight size={13} className="inline ml-2" />
                    </span>
                  </Link>
                ))}
              </section>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)] gap-6">
              <section className="admin-panel min-w-0">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Recent orders</h2>
                    <p>Latest payment records across all dates</p>
                  </div>
                  <Link href="/admin/revenue" className="admin-link">
                    View all
                  </Link>
                </div>
                {recent.length ? (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Book</th>
                          <th>Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((order) => (
                          <tr key={order.id}>
                            <td>
                              {order.bookTitle}
                              <small>
                                {dateValue(order.createdAt)
                                  ? new Date(dateValue(order.createdAt)).toLocaleDateString()
                                  : 'Date unavailable'}
                              </small>
                            </td>
                            <td>{centsToDisplay(order.finalPrice)}</td>
                            <td>
                              <AdminBadge tone={order.status === 'completed' ? 'good' : 'warning'}>
                                {order.status.replaceAll('_', ' ')}
                              </AdminBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="admin-empty">No orders yet. New purchases will appear here.</p>
                )}
              </section>
              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Your community</h2>
                    <p>Current accounts and author payment readiness</p>
                  </div>
                </div>
                {[
                  ['Registered people', users.data.length],
                  ['Authors', sellers.data.length],
                  [
                    'Stripe setup complete',
                    sellers.data.filter((seller) => seller.stripeAccountStatus === 'active').length,
                  ],
                  [
                    'Stripe setup needed',
                    sellers.data.filter((seller) => seller.stripeAccountStatus !== 'active').length,
                  ],
                ].map(([label, value]) => (
                  <div className="admin-queue-row" key={label}>
                    <p>{label}</p>
                    <span>{value}</span>
                  </div>
                ))}
                <p className="px-6 py-4 text-xs leading-relaxed admin-muted">
                  Payment readiness reflects the last Stripe check. Checkout verifies eligibility
                  again.
                </p>
              </section>
            </div>
          </>
        )
      )}
    </main>
  );
}
