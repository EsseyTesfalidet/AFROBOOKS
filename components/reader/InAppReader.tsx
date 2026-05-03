'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings } from 'lucide-react';
import ReaderProgress from './ReaderProgress';
import ChapterNav from './ChapterNav';
import PreviewGate from './PreviewGate';
import { useReaderStore, THEME_STYLES, FONT_SIZE_PX, LINE_SPACING_VALUE } from '@/store/readerStore';
import { getChapters } from '@/lib/firebase/firestore';
import { saveReadingProgress } from '@/lib/firebase/firestore';
import type { Book, Chapter } from '@/types/book';

interface Props {
  book: Book;
  userId: string;
  hasAccess: boolean;
}

export default function InAppReader({ book, userId, hasAccess }: Props) {
  const router = useRouter();
  const { theme, fontSize, lineSpacing, currentChapter, setCurrentChapter } = useReaderStore();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [percent, setPercent] = useState(0);
  const [showPreviewGate, setShowPreviewGate] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getChapters(book.id).then((chs) => {
      setChapters(chs as Chapter[]);
      setLoading(false);
    });
  }, [book.id]);

  const activeChapter = chapters.find((c) => c.chapterNumber === currentChapter);
  const isPreviewChapter = activeChapter?.isPreview ?? false;
  const isLocked = activeChapter?.isLocked ?? false;

  const themeStyle = THEME_STYLES[theme];
  const fontSizePx = FONT_SIZE_PX[fontSize];
  const lineHeightVal = LINE_SPACING_VALUE[lineSpacing];

  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const scrolled = el.scrollTop;
    const total = el.scrollHeight - el.clientHeight;
    const pct = total > 0 ? Math.round((scrolled / total) * 100) : 0;
    setPercent(pct);

    // Show preview gate when reaching end of preview chapter
    if (isPreviewChapter && !hasAccess && pct >= 90) {
      setShowPreviewGate(true);
    }

    // Auto-save every 30s
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      saveReadingProgress(userId, book.id, {
        currentChapter,
        scrollPosition: scrolled,
        percentComplete: pct,
        isFinished: pct >= 95,
      });
    }, 30000);
  }, [currentChapter, isPreviewChapter, hasAccess, userId, book.id]);

  function changeChapter(num: number) {
    if (!hasAccess && chapters.find((c) => c.chapterNumber === num)?.isLocked) {
      setShowPreviewGate(true);
      return;
    }
    setCurrentChapter(num);
    setShowPreviewGate(false);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const isReading = hasAccess || isPreviewChapter;

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: themeStyle.bg }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-12 flex-shrink-0 z-10"
        style={{ background: '#0e0e0e', borderBottom: '1px solid #1a1a1a' }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border"
          style={{ borderColor: '#2a2a2a', color: '#aaa' }}
        >
          <ArrowLeft size={14} />
          Exit Reader
        </button>

        <p className="font-display text-sm text-white truncate max-w-[200px]">{book.title}</p>

        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5 rounded font-medium"
            style={{
              background: isPreviewChapter && !hasAccess ? '#2e1a0f' : '#0f2e1a',
              color: isPreviewChapter && !hasAccess ? '#f5b800' : '#4ade80',
            }}
          >
            {isPreviewChapter && !hasAccess ? 'PREVIEW' : 'READING'}
          </span>

          {!loading && (
            <ChapterNav chapters={chapters} current={currentChapter} onSelect={changeChapter} />
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="p-1.5 rounded-lg border"
            style={{ borderColor: '#2a2a2a', color: '#aaa' }}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <ReaderProgress percent={percent} />

      {/* Settings panel */}
      {settingsOpen && (
        <div
          className="absolute top-12 right-4 z-20 w-64 p-4 rounded-xl border space-y-4"
          style={{ background: '#111', borderColor: '#222' }}
        >
          <div>
            <p className="text-xs text-[#555] uppercase tracking-wider mb-2">Theme</p>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(THEME_STYLES) as (keyof typeof THEME_STYLES)[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => useReaderStore.getState().setTheme(t)}
                  className="p-2 rounded-lg border text-xs"
                  style={{
                    background: THEME_STYLES[t].bg,
                    color: THEME_STYLES[t].text,
                    border: theme === t ? '1.5px solid #e8442a' : '1.5px solid #333',
                  }}
                >
                  {THEME_STYLES[t].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-[#555] uppercase tracking-wider mb-2">Font Size</p>
            <div className="flex gap-2">
              {(['small', 'medium', 'large', 'xlarge'] as const).map((s) => (
                <button key={s} type="button" onClick={() => useReaderStore.getState().setFontSize(s)}
                  className="flex-1 py-1.5 rounded-lg border text-xs capitalize"
                  style={{ background: fontSize === s ? '#e8442a' : '#1a1a1a', color: fontSize === s ? '#fff' : '#888', borderColor: fontSize === s ? '#e8442a' : '#333' }}>
                  {s[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-[#555] uppercase tracking-wider mb-2">Line Spacing</p>
            <div className="flex gap-2">
              {(['compact', 'normal', 'relaxed'] as const).map((s) => (
                <button key={s} type="button" onClick={() => useReaderStore.getState().setLineSpacing(s)}
                  className="flex-1 py-1.5 rounded-lg border text-xs capitalize"
                  style={{ background: lineSpacing === s ? '#e8442a' : '#1a1a1a', color: lineSpacing === s ? '#fff' : '#888', borderColor: lineSpacing === s ? '#e8442a' : '#333' }}>
                  {s[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-8"
      >
        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#333', borderTopColor: '#e8442a' }} />
          </div>
        ) : !isReading ? (
          <PreviewGate bookId={book.id} bookTitle={book.title} price={book.price} />
        ) : activeChapter ? (
          <div className="max-w-[640px] mx-auto">
            <h2
              className="font-display mb-6"
              style={{ fontSize: '20px', color: themeStyle.text }}
            >
              {activeChapter.title}
            </h2>
            <div
              className="font-reader prose max-w-none"
              style={{
                fontSize: fontSizePx,
                lineHeight: lineHeightVal,
                color: themeStyle.text,
              }}
              dangerouslySetInnerHTML={{ __html: activeChapter.content }}
            />
            {showPreviewGate && (
              <PreviewGate bookId={book.id} bookTitle={book.title} price={book.price} />
            )}
          </div>
        ) : (
          <p className="text-center py-16" style={{ color: themeStyle.text, opacity: 0.4 }}>
            No content available.
          </p>
        )}
      </div>
    </div>
  );
}
