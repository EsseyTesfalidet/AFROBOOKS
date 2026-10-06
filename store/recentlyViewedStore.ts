import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { accountStorage } from '@/lib/auth/tabAccount';

interface RecentlyViewedState {
  bookIds: string[];
  addBook: (bookId: string) => void;
  clear: () => void;
  retainBooks: (bookIds: string[]) => void;
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
      retainBooks: (ids) => set(state => {
        const bookIds = state.bookIds.filter(id => ids.includes(id));
        return bookIds.length === state.bookIds.length ? state : { bookIds };
      }),
    }),
    { storage: createJSONStorage(accountStorage),
      name: 'afrobooks-recently-viewed' }
  )
);
