import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book } from '@/types/book';

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

      applyPromo: (code, discount, bookId) =>
        set({ promoCode: code, promoBookId: bookId, discountAmount: discount }),
      removePromo: () => set({ promoCode: null, promoBookId: null, discountAmount: 0 }),

      isInCart: (bookId) => get().items.some((i) => i.bookId === bookId),

      getSubtotal: () => get().items.reduce((sum, i) => sum + i.price, 0),

      getBundleDiscount: () => {
        const subtotal = get().getSubtotal();
        return get().items.length >= 3 ? Math.round(subtotal * 0.05) : 0;
      },

      getTotal: () => {
        const subtotal = get().getSubtotal();
        const bundle = get().getBundleDiscount();
        const promo = get().discountAmount;
        return Math.max(0, subtotal - bundle - promo);
      },
    }),
    { name: 'afrobooks-cart' }
  )
);
