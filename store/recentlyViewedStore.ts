import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RecentlyViewedState {
  bookIds: string[];
  addBook: (bookId: string) => void;
  clear: () => void;
}

const MAX_RECENT_BOOKS = 12;

export const useRecentlyViewedStore = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      bookIds: [],
      addBook: (bookId) =>
        set((state) => ({
          bookIds: [bookId, ...state.bookIds.filter((id) => id !== bookId)].slice(0, MAX_RECENT_BOOKS),
        })),
      clear: () => set({ bookIds: [] }),
    }),
    { name: 'afrobooks-recently-viewed' }
  )
);
