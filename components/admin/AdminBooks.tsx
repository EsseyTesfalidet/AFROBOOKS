'use client';

import { useState } from 'react';
import Link from 'next/link';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { authenticatedPost } from '@/lib/firebase/request';
import BookCover from '@/components/shared/BookCover';
import {
  AdminHeading,
  AdminSearch,
  AdminPagination,
  AdminDrawer,
  AdminError,
  AdminBadge,
} from '@/components/admin/AdminUI';
import { useAdminCollection } from '@/lib/admin/useAdminCollection';
import { dateValue } from '@/lib/admin/metrics';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import { getCopyrightBasisLabel } from '@/lib/utils/copyright';
import type { Book } from '@/types/book';

export default function AdminBooks({ flaggedOnly = false }: { flaggedOnly?: boolean }) {
  const { data: books, loading, error, retry } = useAdminCollection<Book>('books');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(flaggedOnly ? 'flagged' : 'all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const needle = search.trim().toLowerCase();
  const filtered = books
    .filter(
      (book) =>
        (flaggedOnly ? book.status === 'flagged' : status === 'all' || book.status === status) &&
        [book.title, book.authorName, book.id].some((value) =>
          value?.toLowerCase().includes(needle),
        ),
    )
    .sort((a, b) =>
      sort === 'title'
        ? (a.title ?? '').localeCompare(b.title ?? '')
        : sort === 'sales'
          ? (b.totalSales ?? 0) - (a.totalSales ?? 0)
          : dateValue(b.createdAt) - dateValue(a.createdAt),
    );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15)));
  const book = books.find((item) => item.id === selected);
  async function act(action: 'live' | 'delete' | 'feature') {
    if (!book || busy) return;
    if (
      action === 'delete' &&
      !window.confirm(
        'Permanently delete "' + book.title + '" and its book files? This cannot be undone.',
      )
    )
      return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      if (action === 'feature')
        await updateDoc(doc(db, 'books', book.id), {
          isFeatured: !book.isFeatured,
          updatedAt: serverTimestamp(),
        });
      else await authenticatedPost('/api/admin/moderate-book', { bookId: book.id, action });
      setNotice(
        action === 'delete'
          ? 'Book deleted.'
          : action === 'live'
            ? 'Book approved for publication.'
            : 'Featured selection updated.',
      );
      if (action === 'delete') setSelected(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to update this book.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <AdminHeading
        title={flaggedOnly ? 'Flagged books' : 'Books'}
        description={
          flaggedOnly
            ? 'Review reported books and their publishing rights before deciding what happens next.'
            : 'Your publishing catalog. Open a book to review its rights, publication status, or featured placement.'
        }
      />
      <AdminError error={error} retry={retry} />
      {notice && (
        <p role="status" className="mb-5 text-sm text-[#d8edb2]">
          {notice}
        </p>
      )}
      <div className="admin-toolbar">
        <AdminSearch
          label="Search title, author, or book ID"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        {!flaggedOnly && (
          <select
            aria-label="Book status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {['all', 'live', 'in_review', 'draft', 'flagged', 'removed'].map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'All statuses' : value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Sort books"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
        >
          <option value="newest">Newest first</option>
          <option value="title">Title A–Z</option>
          <option value="sales">Most sales</option>
        </select>
      </div>
      <section className="admin-panel">
        {loading ? (
          <p className="admin-empty" role="status">
            Loading books…
          </p>
        ) : error ? null : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Book / author</th>
                    <th>Price</th>
                    <th>Sales</th>
                    <th>Publication</th>
                    <th>Placement</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((currentPage - 1) * 15, currentPage * 15).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-9 shrink-0">
                            <BookCover book={item} compact />
                          </div>
                          <div>
                            <button
                              type="button"
                              className="admin-row-title"
                              onClick={() => {
                                setSelected(item.id);
                                setActionError('');
                                setNotice('');
                              }}
                            >
                              {item.title || 'Untitled book'}
                            </button>
                            <small>{item.authorName || 'Unknown author'}</small>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">{centsToDisplay(item.price ?? 0)}</td>
                      <td>{(item.totalSales ?? 0).toLocaleString()}</td>
                      <td>
                        <AdminBadge
                          tone={
                            item.status === 'live'
                              ? 'good'
                              : ['in_review', 'flagged'].includes(item.status)
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {item.status?.replaceAll('_', ' ') ?? 'Unknown'}
                        </AdminBadge>
                      </td>
                      <td className="admin-muted">{item.isFeatured ? 'Featured' : 'Standard'}</td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={5} className="admin-empty">
                        No books match your search and filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <AdminPagination page={currentPage} total={filtered.length} onChange={setPage} />
          </>
        )}
      </section>
      {book && (
        <AdminDrawer busy={busy} title="Book details" onClose={() => setSelected(null)}>
          <div className="flex gap-5">
            <div className="w-24 shrink-0">
              <BookCover book={book} />
            </div>
            <div>
              <h3 className="text-xl font-semibold">{book.title}</h3>
              <p className="text-[#a6afa3] mt-2">{book.authorName}</p>
              <div className="mt-3">
                <AdminBadge>{book.status?.replaceAll('_', ' ')}</AdminBadge>
              </div>
            </div>
          </div>
          <dl>
            <div>
              <dt>Customer price</dt>
              <dd>{centsToDisplay(book.price ?? 0)}</dd>
            </div>
            <div>
              <dt>Copies sold</dt>
              <dd>{book.totalSales ?? 0}</dd>
            </div>
            <div>
              <dt>Genre</dt>
              <dd>{book.genre || 'Unspecified'}</dd>
            </div>
            <div>
              <dt>Reader rating</dt>
              <dd>
                {book.averageRating ? book.averageRating.toFixed(1) + ' / 5' : 'Not rated yet'}
              </dd>
            </div>
          </dl>
          <div className="border-y border-[#30352f] py-5">
            <h3 className="font-medium">Publishing rights</h3>
            <p className="mt-2 text-[#c4ccbe]">{getCopyrightBasisLabel(book.copyrightBasis)}</p>
            <p className="mt-2 text-sm text-[#a6afa3] whitespace-pre-wrap">
              {book.copyrightDetails || 'No additional declaration provided.'}
            </p>
            {book.flagReason && <p className="mt-3 text-amber-200">Flag: {book.flagReason}</p>}
          </div>
          <p className="mt-5 text-xs text-[#a6afa3]">Book ID: {book.id}</p>
          <AdminError error={actionError} />
          <div className="admin-drawer-actions">
            {['in_review', 'flagged'].includes(book.status) && (
              <button
                type="button"
                disabled={busy}
                className="admin-primary"
                onClick={() => act('live')}
              >
                {busy ? 'Saving…' : 'Approve publication'}
              </button>
            )}
            {book.status === 'live' && (
              <>
                <Link href={'/book/' + book.id} className="admin-secondary">
                  View listing
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  className="admin-secondary"
                  onClick={() => act('feature')}
                >
                  {book.isFeatured ? 'Remove from featured' : 'Feature book'}
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            className="admin-danger"
            onClick={() => act('delete')}
          >
            Delete book permanently
          </button>
        </AdminDrawer>
      )}
    </main>
  );
}
