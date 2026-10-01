import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { sanitizeChapter } from '@/lib/utils/sanitizeChapter';

export class BookContentError extends Error {}

// Validate stored chapters, not the count claimed by the publishing form.
export function validateBookContent(book: DocumentData, chapters: QueryDocumentSnapshot[], pdf?: DocumentData) {
  if (book.contentFormat === 'pdf') {
    if (book.publicationType !== 'magazine' || !pdf || pdf.sellerId !== book.sellerId || !pdf.path?.startsWith(`magazines/${book.sellerId}/`) || !pdf.generation || !Number.isSafeInteger(pdf.pageCount) || pdf.pageCount < 1 || pdf.pageCount > 500) throw new BookContentError('Upload and verify the magazine PDF before publishing or selling it.');
    return;
  }
  if (!Number.isSafeInteger(book.chapterCount) || book.chapterCount < 1 || chapters.length !== book.chapterCount) {
    throw new BookContentError('The book is missing chapters. Upload all chapters before publishing.');
  }
  const sorted = chapters.map((chapter) => chapter.data()).sort((a, b) => a.chapterNumber - b.chapterNumber);
  for (const [index, chapter] of sorted.entries()) {
    const text = typeof chapter.content === 'string'
      ? sanitizeChapter(chapter.content).replace(/<[^>]*>/g, '').replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ').trim()
      : '';
    if (chapter.chapterNumber !== index + 1 || !text) {
      throw new BookContentError('Every chapter must contain readable text and be numbered in order from 1.');
    }
  }
}
