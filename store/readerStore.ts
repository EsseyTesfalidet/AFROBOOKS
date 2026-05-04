import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ReaderTheme = 'dark' | 'night' | 'sepia' | 'paper';
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
export type LineSpacing = 'compact' | 'normal' | 'relaxed';
export type FontFamily = 'serif' | 'sans';
export type MarginSize = 'narrow' | 'normal' | 'wide';

interface ReaderState {
  theme: ReaderTheme;
  fontSize: FontSize;
  lineSpacing: LineSpacing;
  fontFamily: FontFamily;
  marginSize: MarginSize;
  currentChapter: number;
  setTheme: (theme: ReaderTheme) => void;
  setFontSize: (size: FontSize) => void;
  setLineSpacing: (spacing: LineSpacing) => void;
  setFontFamily: (family: FontFamily) => void;
  setMarginSize: (size: MarginSize) => void;
  setCurrentChapter: (chapter: number) => void;
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      theme: 'dark',
      fontSize: 'medium',
      lineSpacing: 'normal',
      fontFamily: 'serif',
      marginSize: 'normal',
      currentChapter: 1,
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setLineSpacing: (lineSpacing) => set({ lineSpacing }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setMarginSize: (marginSize) => set({ marginSize }),
      setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
    }),
    { name: 'afrobooks-reader' }
  )
);

export const THEME_STYLES: Record<ReaderTheme, {
  bg: string; text: string; muted: string; accent: string;
  surface: string; border: string; headerBg: string; label: string;
}> = {
  dark: {
    bg: '#131520',
    text: '#e8d9c0',
    muted: '#5a6070',
    accent: '#e8442a',
    surface: '#1c1f2e',
    border: '#252836',
    headerBg: '#0d0f18',
    label: 'Dark',
  },
  night: {
    bg: '#080808',
    text: '#c9a96e',
    muted: '#4a4030',
    accent: '#c9a96e',
    surface: '#111111',
    border: '#1e1a14',
    headerBg: '#040404',
    label: 'Night',
  },
  sepia: {
    bg: '#fbf0d9',
    text: '#3d2b1f',
    muted: '#9a7c60',
    accent: '#b5651d',
    surface: '#f2e3c4',
    border: '#ddd0b3',
    headerBg: '#f2e3c4',
    label: 'Sepia',
  },
  paper: {
    bg: '#f8f7f4',
    text: '#1a1917',
    muted: '#78716c',
    accent: '#e8442a',
    surface: '#f0efeb',
    border: '#e4e3df',
    headerBg: '#f0efeb',
    label: 'Paper',
  },
};

export const FONT_SIZE_PX: Record<FontSize, string> = {
  small: '15px',
  medium: '17px',
  large: '19px',
  xlarge: '21px',
};

export const LINE_SPACING_VALUE: Record<LineSpacing, string> = {
  compact: '1.65',
  normal: '1.9',
  relaxed: '2.2',
};

export const FONT_FAMILIES: Record<FontFamily, string> = {
  serif: "'Lora', Georgia, 'Times New Roman', serif",
  sans: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
};

export const FONT_LABELS: Record<FontFamily, string> = {
  serif: 'Serif',
  sans: 'Sans',
};

export const MARGIN_MAX_WIDTH: Record<MarginSize, string> = {
  narrow: '740px',
  normal: '640px',
  wide: '540px',
};

export const MARGIN_PADDING_X: Record<MarginSize, string> = {
  narrow: '16px',
  normal: '28px',
  wide: '44px',
};
