import type { Book } from '@/types/book';
import type { Seller } from '@/types/user';

export const SELLER_BOOKS_BEFORE_ID_VERIFICATION = 2;

export const DEFAULT_SELLER_VERIFICATION_STATUS: Seller['verificationStatus'] = {
  emailVerified: true,
  bioAdded: false,
  firstBookPublished: false,
  idVerified: false,
  tenSalesReached: false,
};

export function countsTowardSellerVerificationBookLimit(
  book: Pick<Book, 'status' | 'isPreorder'>
) {
  return book.status === 'live' || book.status === 'in_review' || book.isPreorder === true;
}

export function getRemainingGraceBooksBeforeIdVerification(publishedBooksCount: number) {
  return Math.max(SELLER_BOOKS_BEFORE_ID_VERIFICATION - publishedBooksCount, 0);
}

export function canSubmitSellerIdVerification(publishedBooksCount: number) {
  return publishedBooksCount >= SELLER_BOOKS_BEFORE_ID_VERIFICATION;
}

export function requiresSellerIdVerificationForPublishing(
  publishedBooksCount: number,
  idVerified: boolean
) {
  return canSubmitSellerIdVerification(publishedBooksCount) && !idVerified;
}

export function hasCompletedSellerVerification(
  status?: Partial<Seller['verificationStatus']> | null
) {
  return Boolean(
    status?.emailVerified &&
    status?.bioAdded &&
    status?.firstBookPublished &&
    status?.idVerified &&
    status?.tenSalesReached
  );
}
