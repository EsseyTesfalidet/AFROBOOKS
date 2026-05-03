'use client';

import { useCartStore } from '@/store/cartStore';
import type { Book } from '@/types/book';

export function useCart() {
  const store = useCartStore();

  function addToCart(book: Book) {
    store.addItem(book);
  }

  function removeFromCart(bookId: string) {
    store.removeItem(bookId);
  }

  return {
    items: store.items,
    itemCount: store.items.length,
    isInCart: store.isInCart,
    addToCart,
    removeFromCart,
    clearCart: store.clearCart,
    applyPromo: store.applyPromo,
    removePromo: store.removePromo,
    promoCode: store.promoCode,
    subtotal: store.getSubtotal(),
    bundleDiscount: store.getBundleDiscount(),
    promoDiscount: store.discountAmount,
    total: store.getTotal(),
  };
}
