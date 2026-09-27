import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book } from '@/types/book';
import { calculateCartTotals } from '@/lib/utils/fees';

export interface CartItem {
  bookId: string;
  title: string;
  authorName: string;
  coverUrl: string;
  coverBgColor: string;
  coverAccentColor: string;
  price: number;
  sellerId: string;
  sellerName: string;
}

interface CartState {
  items: CartItem[];
  promoCode: string | null;
  promoBookId: string | null;
  discountAmount: number;
  addItem: (book: Book) => void;
  removeItem: (bookId: string) => void;
  reconcileBooks: (books: Book[]) => void;
  clearCart: () => void;
  applyPromo: (code: string, discount: number, bookId: string) => void;
  removePromo: () => void;
  isInCart: (bookId: string) => boolean;
  getSubtotal: () => number;
  getBundleDiscount: () => number;
  getTotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      promoCode: null,
      promoBookId: null,
      discountAmount: 0,

      addItem: (book) => {
        const { items } = get();
        if (items.some((i) => i.bookId === book.id)) return;
        set({
          items: [
            ...items,
            {
              bookId: book.id,
              title: book.title,
              authorName: book.authorName,
              coverUrl: book.coverUrl,
              coverBgColor: book.coverBgColor,
              coverAccentColor: book.coverAccentColor,
              price: book.price,
              sellerId: book.sellerId,
              sellerName: book.sellerName,
            },
          ],
        });
      },

      removeItem: (bookId) =>
        set((state) => ({
          items: state.items.filter((i) => i.bookId !== bookId),
          promoCode: state.promoBookId === bookId ? null : state.promoCode,
          promoBookId: state.promoBookId === bookId ? null : state.promoBookId,
          discountAmount: state.promoBookId === bookId ? 0 : state.discountAmount,
        })),

      clearCart: () => set({ items: [], promoCode: null, promoBookId: null, discountAmount: 0 }),

      reconcileBooks: (books) => set(state => {
        const live = new Map(books.map(book => [book.id, book]));
        const items = state.items.flatMap(item => {
          const book = live.get(item.bookId);
          return book ? [{ ...item, title: book.title, authorName: book.authorName, coverUrl: book.coverUrl, coverBgColor: book.coverBgColor, coverAccentColor: book.coverAccentColor, price: book.price }] : [];
        });
        return JSON.stringify(items) === JSON.stringify(state.items) ? state : { items };
      }),

      applyPromo: (code, discount, bookId) =>
        set({ promoCode: null, promoBookId: null, discountAmount: 0 }),
      removePromo: () => set({ promoCode: null, promoBookId: null, discountAmount: 0 }),

      isInCart: (bookId) => get().items.some((i) => i.bookId === bookId),

      getSubtotal: () => get().items.reduce((sum, i) => sum + i.price, 0),

      getBundleDiscount: () => calculateCartTotals(get().items.map(item => item.price)).bundleDiscount,

      getTotal: () => calculateCartTotals(get().items.map(item => item.price)).total,
    }),
    { name: 'afrobooks-cart', version: 1, migrate: (state) => ({ ...(state as CartState), promoCode: null, promoBookId: null, discountAmount: 0 }) }
  )
);
