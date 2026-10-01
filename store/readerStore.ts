import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ReaderTheme = 'dark' | 'night' | 'sepia' | 'paper';
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
export type LineSpacing = 'compact' | 'normal' | 'relaxed';
export type FontFamily = 'serif' | 'sans';
export type MarginSize = 'narrow' | 'normal' | 'wide';
export type ReadingMode = 'scroll' | 'pages';

interface ReaderState {
  theme: ReaderTheme;
  fontSize: FontSize;
  lineSpacing: LineSpacing;
  fontFamily: FontFamily;
  marginSize: MarginSize;
  readingMode: ReadingMode;
  currentChapter: number;
  setTheme: (theme: ReaderTheme) => void;
  setFontSize: (size: FontSize) => void;
  setLineSpacing: (spacing: LineSpacing) => void;
  setFontFamily: (family: FontFamily) => void;
  setMarginSize: (size: MarginSize) => void;
  setReadingMode: (mode: ReadingMode) => void;
  setCurrentChapter: (chapter: number) => void;
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      theme: 'paper',
      fontSize: 'medium',
      lineSpacing: 'normal',
      fontFamily: 'serif',
      marginSize: 'normal',
      readingMode: 'scroll',
      currentChapter: 1,
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setLineSpacing: (lineSpacing) => set({ lineSpacing }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setMarginSize: (marginSize) => set({ marginSize }),
      setReadingMode: (readingMode) => set({ readingMode }),
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
    bg: '#191b1d',
    text: '#e7e4de',
    muted: '#aaa79f',
    accent: '#d7bc8b',
    surface: '#242628',
    border: '#3b3c3d',
    headerBg: '#191b1d',
    label: 'Dark',
  },
  night: {
    bg: '#0d0e10',
    text: '#c9c8c3',
    muted: '#96958d',
    accent: '#bda77e',
    surface: '#191a1c',
    border: '#343537',
    headerBg: '#0d0e10',
    label: 'Night',
  },
  sepia: {
    bg: '#f3e7d0',
    text: '#3e3324',
    muted: '#776349',
    accent: '#775433',
    surface: '#eadcc1',
    border: '#d3c4a8',
    headerBg: '#f3e7d0',
    label: 'Sepia',
  },
  paper: {
    bg: '#faf8f3',
    text: '#292721',
    muted: '#6e685e',
    accent: '#806341',
    surface: '#f1eee7',
    border: '#ddd7ce',
    headerBg: '#faf8f3',
    label: 'Paper',
  },
};

export const FONT_SIZE_PX: Record<FontSize, string> = {
  small: '17px',
  medium: '20px',
  large: '23px',
  xlarge: '27px',
};

export const LINE_SPACING_VALUE: Record<LineSpacing, string> = {
  compact: '1.5',
  normal: '1.8',
  relaxed: '2.1',
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
  narrow: '800px',
  normal: '720px',
  wide: '620px',
};

export const MARGIN_PADDING_X: Record<MarginSize, string> = {
  narrow: '24px',
  normal: '40px',
  wide: '56px',
};
