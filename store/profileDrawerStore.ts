import { create } from 'zustand';

interface DrawerState {
  isOpen: boolean;
  section: string;
  open: (section?: string) => void;
  close: () => void;
  setSection: (section: string) => void;
}

export const useBuyerDrawerStore = create<DrawerState>((set) => ({
  isOpen: false,
  section: 'account',
  open: (section = 'account') => set({ isOpen: true, section }),
  close: () => set({ isOpen: false }),
  setSection: (section) => set({ section }),
}));

export const useSellerDrawerStore = create<DrawerState>((set) => ({
  isOpen: false,
  section: 'identity',
  open: (section = 'identity') => set({ isOpen: true, section }),
  close: () => set({ isOpen: false }),
  setSection: (section) => set({ section }),
}));
