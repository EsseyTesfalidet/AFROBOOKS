import type { Book, PublicationType } from '@/types/book';

export function publicationType(book: Pick<Book, 'publicationType'>): PublicationType {
  return book.publicationType === 'magazine' ? 'magazine' : book.publicationType === 'short_story' ? 'short_story' : 'book';
}

export function publicationLabel(book: Pick<Book, 'publicationType' | 'issueLabel'>): string {
  return publicationType(book) === 'magazine' ? ['Magazine', book.issueLabel].filter(Boolean).join(' · ') : publicationType(book) === 'short_story' ? 'Short story' : 'Book';
}

export function publicationTitle(book: Pick<Book, 'publicationType' | 'issueLabel' | 'title'>): string {
  return publicationType(book) === 'magazine' && book.issueLabel ? `${book.title} — ${book.issueLabel}` : book.title;
}

export function validatePublicationDetails(book: { publicationType?: unknown; issueLabel?: unknown; contentFormat?: unknown }) {
  if (book.publicationType !== undefined && !['book', 'magazine', 'short_story'].includes(book.publicationType as string)) throw new Error('Choose Book, Magazine issue or Short story.');
  if (book.issueLabel != null && (typeof book.issueLabel !== 'string' || book.issueLabel.length > 60)) throw new Error('Issue details must be 60 characters or fewer.');
  if (book.contentFormat !== undefined && !['text', 'pdf'].includes(book.contentFormat as string)) throw new Error('Choose editor content or PDF.');
  if (book.contentFormat === 'pdf' && book.publicationType !== 'magazine') throw new Error('PDF issues require the Magazine publication type.');
}
