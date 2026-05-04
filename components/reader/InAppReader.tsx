'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Type, X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import PreviewGate from './PreviewGate';
import {
  useReaderStore,
  THEME_STYLES,
  FONT_SIZE_PX,
  LINE_SPACING_VALUE,
  FONT_FAMILIES,
  FONT_LABELS,
  MARGIN_MAX_WIDTH,
  MARGIN_PADDING_X,
  type ReaderTheme,
  type FontFamily,
} from '@/store/readerStore';
import { getChapters, saveReadingProgress } from '@/lib/firebase/firestore';
import type { Book, Chapter } from '@/types/book';

const WPM = 238;
function countWords(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

interface Props {
  book: Book;
  userId: string;
  hasAccess: boolean;
}

export default function InAppReader({ book, userId, hasAccess }: Props) {
  const router = useRouter();
  const {
    theme, fontSize, lineSpacing, fontFamily, marginSize,
    currentChapter, setCurrentChapter,
  } = useReaderStore();

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [percent, setPercent] = useState(0);
  const [showPreviewGate, setShowPreviewGate] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [footerVisible, setFooterVisible] = useState(true);
  const [fadeIn, setFadeIn] = useState(true);

  const contentRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollY = useRef(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    getChapters(book.id).then((chs) => {
      setChapters(chs as Chapter[]);
      setLoading(false);
    });
  }, [book.id]);

  const activeChapter = chapters.find((c) => c.chapterNumber === currentChapter);
  const isPreviewChapter = activeChapter?.isPreview ?? false;
  const totalChapters = chapters.length;
  const prevChapter = chapters.find((c) => c.chapterNumber === currentChapter - 1);
  const nextChapter = chapters.find((c) => c.chapterNumber === currentChapter + 1);
  const wordCount = activeChapter ? countWords(activeChapter.content) : 0;
  const readingMins = Math.max(1, Math.ceil(wordCount / WPM));
  const remainingMins = Math.max(0, Math.ceil((wordCount * (1 - percent / 100)) / WPM));

  const th = THEME_STYLES[theme];

  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const scrolled = el.scrollTop;
    const total = el.scrollHeight - el.clientHeight;
    const pct = total > 0 ? Math.round((scrolled / total) * 100) : 0;
    setPercent(pct);

    const delta = scrolled - lastScrollY.current;
    if (Math.abs(delta) > 6) {
      if (delta > 0 && scrolled > 60) {
        setHeaderVisible(false);
        setFooterVisible(false);
      } else {
        setHeaderVisible(true);
        setFooterVisible(true);
      }
    }
    lastScrollY.current = scrolled;

    if (isPreviewChapter && !hasAccess && pct >= 90) setShowPreviewGate(true);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
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
    setFadeIn(false);
    setTimeout(() => {
      setCurrentChapter(num);
      setShowPreviewGate(false);
      contentRef.current?.scrollTo({ top: 0 });
      lastScrollY.current = 0;
      setPercent(0);
      setFadeIn(true);
    }, 160);
  }

  function onContentClick(e: React.MouseEvent<HTMLDivElement>) {
    if (settingsOpen) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'A' || tag === 'BUTTON') return;
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    setHeaderVisible((v) => !v);
    setFooterVisible((v) => !v);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0 && nextChapter) changeChapter(currentChapter + 1);
    else if (dx > 0 && prevChapter) changeChapter(currentChapter - 1);
  }

  const isReading = hasAccess || isPreviewChapter;

  const dotRange = chapters.slice(
    Math.max(0, currentChapter - 3),
    Math.min(totalChapters, currentChapter + 2)
  );

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: th.bg }}>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between flex-shrink-0 z-20 transition-transform duration-300 select-none"
        style={{
          height: 52,
          background: th.headerBg,
          borderBottom: `1px solid ${th.border}`,
          transform: headerVisible ? 'translateY(0)' : 'translateY(-100%)',
          paddingLeft: 12, paddingRight: 12,
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-opacity hover:opacity-60"
          style={{ color: th.muted }}
        >
          <ArrowLeft size={16} />
          <span className="text-sm hidden sm:inline" style={{ color: th.muted }}>Back</span>
        </button>

        <div className="flex-1 text-center min-w-0 mx-3">
          <p className="text-xs font-medium truncate" style={{ color: th.text, opacity: 0.75 }}>
            {book.title}
          </p>
          <p className="text-xs mt-0.5" style={{ color: th.muted, fontSize: 10 }}>
            Ch {currentChapter}/{totalChapters}
            {percent > 0 && remainingMins > 0 ? ` · ${remainingMins}m left` : ` · ${readingMins}m read`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center justify-center rounded-xl px-3 py-1.5 transition-opacity hover:opacity-60"
          style={{ color: th.muted }}
        >
          <Type size={16} />
        </button>
      </div>

      {/* ── Progress bar ────────────────────────────────────── */}
      <div className="w-full flex-shrink-0" style={{ height: 2, background: th.border }}>
        <div
          className="h-full transition-all duration-700 ease-out"
          style={{ width: `${Math.min(100, percent)}%`, background: th.accent }}
        />
      </div>

      {/* ── Scrollable content ──────────────────────────────── */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        onClick={onContentClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 72 }}
      >
        {loading ? (
          <div className="flex justify-center pt-24">
            <div
              className="animate-spin rounded-full"
              style={{ width: 32, height: 32, border: `2px solid ${th.border}`, borderTopColor: th.accent }}
            />
          </div>
        ) : !isReading ? (
          <div className="max-w-xl mx-auto px-4 pt-12">
            <PreviewGate bookId={book.id} bookTitle={book.title} price={book.price} />
          </div>
        ) : activeChapter ? (
          <div
            className="mx-auto transition-opacity duration-150"
            style={{
              maxWidth: MARGIN_MAX_WIDTH[marginSize],
              paddingLeft: MARGIN_PADDING_X[marginSize],
              paddingRight: MARGIN_PADDING_X[marginSize],
              paddingTop: 48,
              paddingBottom: 64,
              opacity: fadeIn ? 1 : 0,
            }}
          >
            {/* Chapter header */}
            <div className="mb-10">
              <p
                className="uppercase tracking-widest mb-2"
                style={{ fontSize: 10, color: th.accent, fontFamily: "'DM Sans', sans-serif" }}
              >
                Chapter {activeChapter.chapterNumber}
              </p>
              <h2
                style={{
                  fontSize: '1.45em',
                  fontWeight: 700,
                  lineHeight: 1.25,
                  color: th.text,
                  fontFamily: FONT_FAMILIES[fontFamily],
                  letterSpacing: '-0.01em',
                }}
              >
                {activeChapter.title}
              </h2>
              <div style={{ marginTop: 14, height: 2, width: 40, background: th.accent, borderRadius: 1, opacity: 0.6 }} />
            </div>

            {/* Chapter body */}
            <div
              className="reader-content"
              style={{
                fontSize: FONT_SIZE_PX[fontSize],
                lineHeight: LINE_SPACING_VALUE[lineSpacing],
                color: th.text,
                fontFamily: FONT_FAMILIES[fontFamily],
              }}
              dangerouslySetInnerHTML={{ __html: activeChapter.content }}
            />

            {showPreviewGate && (
              <div className="mt-10">
                <PreviewGate bookId={book.id} bookTitle={book.title} price={book.price} />
              </div>
            )}

            {/* End-of-chapter nav */}
            {!showPreviewGate && (
              <div
                className="flex items-center justify-between mt-14 pt-6 select-none"
                style={{ borderTop: `1px solid ${th.border}` }}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); prevChapter && changeChapter(currentChapter - 1); }}
                  disabled={!prevChapter}
                  className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl transition-opacity disabled:opacity-25 hover:opacity-70"
                  style={{ background: th.surface, color: th.text }}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span style={{ fontSize: 12, color: th.muted }}>{currentChapter} / {totalChapters}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); nextChapter && changeChapter(currentChapter + 1); }}
                  disabled={!nextChapter}
                  className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl transition-opacity disabled:opacity-25 hover:opacity-70"
                  style={{ background: th.accent, color: '#fff' }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center py-16 text-sm" style={{ color: th.muted }}>No content available.</p>
        )}
      </div>

      {/* ── Bottom chapter nav ───────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 flex items-center justify-between flex-shrink-0 z-20 transition-transform duration-300 select-none"
        style={{
          height: 52,
          background: th.headerBg,
          borderTop: `1px solid ${th.border}`,
          transform: footerVisible ? 'translateY(0)' : 'translateY(100%)',
          paddingLeft: 12, paddingRight: 12,
        }}
      >
        <button
          type="button"
          onClick={() => prevChapter && changeChapter(currentChapter - 1)}
          disabled={!prevChapter}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-opacity disabled:opacity-25 hover:opacity-70"
          style={{ color: th.text, maxWidth: '30%' }}
        >
          <ChevronLeft size={14} />
          <span className="truncate">{prevChapter ? prevChapter.title : 'Previous'}</span>
        </button>

        <div className="flex items-center gap-1.5">
          {dotRange.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => changeChapter(ch.chapterNumber)}
              className="rounded-full transition-all duration-200"
              style={{
                width: ch.chapterNumber === currentChapter ? 22 : 6,
                height: 6,
                background: ch.chapterNumber === currentChapter ? th.accent : th.border,
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => nextChapter && changeChapter(currentChapter + 1)}
          disabled={!nextChapter}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-opacity disabled:opacity-25 hover:opacity-70"
          style={{ color: th.text, maxWidth: '30%' }}
        >
          <span className="truncate">{nextChapter ? nextChapter.title : 'Next'}</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* ── Settings bottom sheet ────────────────────────────── */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-30 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="rounded-t-2xl space-y-5 overflow-y-auto"
            style={{ background: th.headerBg, border: `1px solid ${th.border}`, padding: '20px 20px 32px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center -mt-1 mb-1">
              <div className="rounded-full" style={{ width: 36, height: 4, background: th.border }} />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: th.text }}>Reading settings</p>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-lg"
                style={{ background: th.surface }}
              >
                <X size={14} style={{ color: th.muted }} />
              </button>
            </div>

            {/* Theme */}
            <div>
              <p className="uppercase tracking-widest mb-3" style={{ fontSize: 10, color: th.muted }}>Theme</p>
              <div className="grid grid-cols-4 gap-2.5">
                {(Object.entries(THEME_STYLES) as [ReaderTheme, typeof THEME_STYLES[ReaderTheme]][]).map(([t, s]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => useReaderStore.getState().setTheme(t)}
                    className="py-4 rounded-xl relative transition-all"
                    style={{
                      background: s.bg,
                      border: `2px solid ${theme === t ? s.accent : s.border}`,
                    }}
                  >
                    {theme === t && (
                      <Check size={10} className="absolute top-1.5 right-1.5" style={{ color: s.accent }} />
                    )}
                    <p className="text-xs font-medium" style={{ color: s.text }}>{s.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Font family */}
            <div>
              <p className="uppercase tracking-widest mb-3" style={{ fontSize: 10, color: th.muted }}>Font</p>
              <div className="grid grid-cols-2 gap-2.5">
                {(Object.entries(FONT_FAMILIES) as [FontFamily, string][]).map(([f, fam]) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => useReaderStore.getState().setFontFamily(f)}
                    className="py-3.5 rounded-xl transition-all text-sm"
                    style={{
                      fontFamily: fam,
                      background: fontFamily === f ? th.accent : th.surface,
                      color: fontFamily === f ? '#fff' : th.text,
                      border: `1.5px solid ${fontFamily === f ? th.accent : th.border}`,
                    }}
                  >
                    {FONT_LABELS[f]}
                    <span className="block text-xs mt-0.5 opacity-60">{f === 'serif' ? 'Classic reading' : 'Modern clean'}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <p className="uppercase tracking-widest mb-3" style={{ fontSize: 10, color: th.muted }}>
                Text size
              </p>
              <div className="flex items-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const s = ['small', 'medium', 'large', 'xlarge'] as const;
                    const i = s.indexOf(fontSize);
                    if (i > 0) useReaderStore.getState().setFontSize(s[i - 1]);
                  }}
                  className="w-11 h-11 rounded-xl flex items-center justify-center font-bold select-none"
                  style={{ background: th.surface, color: th.text, fontSize: 16 }}
                >
                  A
                </button>
                <div className="flex-1 flex items-end gap-1.5 pb-1">
                  {(['small', 'medium', 'large', 'xlarge'] as const).map((s, i) => (
                    <div
                      key={s}
                      onClick={() => useReaderStore.getState().setFontSize(s)}
                      className="flex-1 rounded-full cursor-pointer transition-all"
                      style={{
                        height: 4 + i * 3,
                        background: fontSize === s ? th.accent : th.border,
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const s = ['small', 'medium', 'large', 'xlarge'] as const;
                    const i = s.indexOf(fontSize);
                    if (i < s.length - 1) useReaderStore.getState().setFontSize(s[i + 1]);
                  }}
                  className="w-11 h-11 rounded-xl flex items-center justify-center font-bold select-none"
                  style={{ background: th.surface, color: th.text, fontSize: 22 }}
                >
                  A
                </button>
              </div>
            </div>

            {/* Line spacing */}
            <div>
              <p className="uppercase tracking-widest mb-3" style={{ fontSize: 10, color: th.muted }}>Line spacing</p>
              <div className="flex gap-2.5">
                {(['compact', 'normal', 'relaxed'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => useReaderStore.getState().setLineSpacing(s)}
                    className="flex-1 py-3 rounded-xl text-xs capitalize font-medium transition-all"
                    style={{
                      background: lineSpacing === s ? th.accent : th.surface,
                      color: lineSpacing === s ? '#fff' : th.text,
                      border: `1.5px solid ${lineSpacing === s ? th.accent : th.border}`,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Margins */}
            <div>
              <p className="uppercase tracking-widest mb-3" style={{ fontSize: 10, color: th.muted }}>Margins</p>
              <div className="flex gap-2.5">
                {(['narrow', 'normal', 'wide'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => useReaderStore.getState().setMarginSize(s)}
                    className="flex-1 py-3 rounded-xl text-xs capitalize font-medium transition-all"
                    style={{
                      background: marginSize === s ? th.accent : th.surface,
                      color: marginSize === s ? '#fff' : th.text,
                      border: `1.5px solid ${marginSize === s ? th.accent : th.border}`,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
