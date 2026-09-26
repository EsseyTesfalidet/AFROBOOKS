import type { Book } from '@/types/book';
import type { User } from '@/types/user';
export function isBookReleased(book: Book) {
  return !book.isPreorder || (book.releaseDate?.toMillis?.() ?? Infinity) <= Date.now();
}
export function canReadWithSubscription(book: Book, user: User | null) {
  return user?.subscriptionStatus === 'active' && book.inSubscription && isBookReleased(book) &&
    (!book.subscriptionTiers?.length || book.subscriptionTiers.includes(user.subscriptionPlan as 'basic' | 'standard' | 'premium')) &&
    (!book.subscriptionEligibleFrom || book.subscriptionEligibleFrom.toMillis() <= Date.now());
}
