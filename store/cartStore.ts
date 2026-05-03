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
  discountAmount: number;
  addItem: (book: Book) => void;
  removeItem: (bookId: string) => void;
  clearCart: () => void;
  applyPromo: (code: string, discount: number) => void;
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
        set({ items: get().items.filter((i) => i.bookId !== bookId) }),

      clearCart: () => set({ items: [], promoCode: null, discountAmount: 0 }),

      applyPromo: (code, discount) => set({ promoCode: code, discountAmount: discount }),
      removePromo: () => set({ promoCode: null, discountAmount: 0 }),

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
