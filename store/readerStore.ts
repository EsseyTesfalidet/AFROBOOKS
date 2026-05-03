import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ReaderTheme = 'parchment' | 'dark' | 'white' | 'sepia';
type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
type LineSpacing = 'compact' | 'normal' | 'relaxed';

interface ReaderState {
  theme: ReaderTheme;
  fontSize: FontSize;
  lineSpacing: LineSpacing;
  currentChapter: number;
  setTheme: (theme: ReaderTheme) => void;
  setFontSize: (size: FontSize) => void;
  setLineSpacing: (spacing: LineSpacing) => void;
  setCurrentChapter: (chapter: number) => void;
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      theme: 'dark',
      fontSize: 'medium',
      lineSpacing: 'normal',
      currentChapter: 1,
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setLineSpacing: (lineSpacing) => set({ lineSpacing }),
      setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
    }),
    { name: 'afrobooks-reader' }
  )
);

export const THEME_STYLES: Record<ReaderTheme, { bg: string; text: string; label: string }> = {
  parchment: { bg: '#f5f0e8', text: '#2a2a2a', label: 'Parchment' },
  dark: { bg: '#1a1a1a', text: '#f5f2eb', label: 'Dark' },
  white: { bg: '#ffffff', text: '#1a1a1a', label: 'White' },
  sepia: { bg: '#f4ecd8', text: '#2a2a2a', label: 'Sepia' },
};

export const FONT_SIZE_PX: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px',
  xlarge: '20px',
};

export const LINE_SPACING_VALUE: Record<LineSpacing, string> = {
  compact: '1.5',
  normal: '1.85',
  relaxed: '2.2',
};
