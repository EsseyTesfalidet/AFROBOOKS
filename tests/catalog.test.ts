import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogShelves, newestBooks, filterCatalog } from '../lib/utils/catalog';
import { publicationTitle, validatePublicationDetails } from '../lib/utils/publication';
import type { Book } from '../types/book';

const book = (id: string, fields: Partial<Book> = {}) => ({ id, title: id, genre: 'History', status: 'live', totalSales: 0, averageRating: 0, reviewCount: 0, ...fields } as Book);

test('magazine filters distinguish legacy books and search issue or organization details', () => {
  const books = [book('legacy'), book('issue', { publicationType: 'magazine', authorName: 'Community Press', issueLabel: 'October 2026' })];
  assert.deepEqual(filterCatalog(books, '', 'All', 'book').map(b => b.id), ['legacy']);
  assert.deepEqual(filterCatalog(books, 'October', 'All', 'magazine').map(b => b.id), ['issue']);
  assert.equal(filterCatalog(books, 'Community Press', 'All', 'magazine').length, 1);
  assert.equal(publicationTitle(books[1]), 'issue — October 2026');
  assert.doesNotThrow(() => validatePublicationDetails({}));
  assert.throws(() => validatePublicationDetails({ publicationType: 'subscription' }));
  assert.throws(() => validatePublicationDetails({ publicationType: 'book', contentFormat: 'pdf' }));
});

test('a catalog without sales, reviews, featured flags or a matching genre still provides recommendations', () => {
  const books = [book('a'), book('b'), book('c')];
  const shelves = catalogShelves(books, 'Fiction');
  assert.equal(shelves.recommended.length, 3);
  assert.equal(shelves.genre.length, 0);
  assert.equal(shelves.popular.length, 0);
  assert.equal(shelves.hidden.length, 0);
  assert.equal(shelves.featured.length, 0);
});

test('genre recommendations lead, stay unique and react to changed preferences without mutating the catalog', () => {
  const books = [book('a', { isFeatured: true, totalSales: 9 }), book('b', { genre: 'Poetry' }), book('c')];
  const before = books.map(item => item.id);
  assert.equal(catalogShelves(books, 'Poetry').recommended[0].id, 'b');
  const history = catalogShelves(books, 'History');
  assert.equal(history.recommended[0].id, 'a');
  assert.equal(new Set(history.recommended.map(item => item.id)).size, 3);
  assert.deepEqual(books.map(item => item.id), before);
});

test('older books with absent sort fields remain visible, and unrated books are not presented as reader recommendations', () => {
  const books = [book('old'), book('new', { publishedAt: { toMillis: () => 100 } as Book['publishedAt'] }), book('invalid', { averageRating: 5 }), book('rated', { averageRating: 4.8, reviewCount: 2 })];
  assert.equal(newestBooks(books)[0].id, 'new');
  assert.equal(newestBooks(books).length, 4);
  assert.deepEqual(catalogShelves(books).hidden.map(item => item.id), ['rated']);
  assert.deepEqual(catalogShelves([]).recommended, []);
});
