'use client';

import './reader.css';
import './reader-mobile.css';

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, List, Type, Check, BookOpen, ScrollText } from 'lucide-react';
import { DomUtils, parseDocument } from 'htmlparser2';
import { sanitizeChapter } from '@/lib/utils/sanitizeChapter';
import { calculateReadingProgress } from '@/lib/utils/readingProgress';
import { readerPageMetrics } from '@/lib/utils/readerPosition';
import { flowReaderParagraphs } from '@/lib/utils/paragraphFlow';
import { useReaderSession } from '@/hooks/useReaderSession';
import { useReaderTheme } from '@/hooks/useReaderTheme';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { useReaderPageMotion } from '@/hooks/useReaderPageMotion';
import { useReaderStore, THEME_STYLES, FONT_SIZE_PX, LINE_SPACING_VALUE, FONT_FAMILIES, MARGIN_MAX_WIDTH, MARGIN_PADDING_X } from '@/store/readerStore';
import type { Book } from '@/types/book';
import ReaderPanel from './ReaderPanel';
import ReaderAppearance from './ReaderAppearance';
import PreviewGate from './PreviewGate';
import MobileReaderProgress from './MobileReaderProgress';

interface Props { book: Book; userId: string | null; hasAccess: boolean }

export default function InAppReader({ book, userId, hasAccess }: Props) {
  const prefs = useReaderStore();
  const installed = useInstalledApp();
  const readerTheme = useReaderTheme();
  const paged = prefs.readingMode === 'pages';
  const { chapters, chapter: chapterNumber, loading, loadError, saveError, percent, pagination, turnPage, scrollerRef, bodyRef, changeChapter, onScroll, retry, retrySave } = useReaderSession(book.id, userId, hasAccess, `${prefs.readingMode}:${prefs.textFlow}:${prefs.fontSize}:${prefs.lineSpacing}:${prefs.fontFamily}:${prefs.marginSize}`);
  const [panel, setPanel] = useState<'chapters' | 'appearance' | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const focused = installed && !controlsVisible && !panel && !loading && !loadError && !saveError;
  const { layer: turnLayerRef, turn: flipPage } = useReaderPageMotion(installed && paged && prefs.pageMotion && !panel && !loading && !loadError, scrollerRef, `${readerTheme}:${prefs.fontSize}:${prefs.lineSpacing}:${prefs.fontFamily}:${prefs.marginSize}:${prefs.textFlow}`);
  const lastScroll = useRef(0);
  const toolbarRef = useRef<HTMLElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const index = chapters.findIndex(chapter => chapter.chapterNumber === chapterNumber);
  const chapter = chapters[index];
  const previous = chapters[index - 1];
  const next = chapters[index + 1];
  const content = useMemo(() => flowReaderParagraphs(sanitizeChapter(chapter?.content ?? ''), prefs.textFlow, book.genre === 'Poetry'), [chapter?.content, prefs.textFlow, book.genre]);
  const sampleText = useMemo(() => Array.from(DomUtils.textContent(parseDocument(content.match(/<p\b[^>]*>[\s\S]*?<\/p>/i)?.[0] ?? '')).replace(/\s+/g, ' ').trim()).slice(0, 240).join(''), [content]);
  const wordCount = useMemo(() => content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, [content]);
  const minutesLeft = Math.ceil(wordCount * (1 - percent / 100) / 238);
  const totalProgress = calculateReadingProgress(index, chapters.length, percent, hasAccess).percentComplete;
  const theme = THEME_STYLES[readerTheme];
  const style = {
    '--reader-bg': theme.bg, '--reader-text': theme.text, '--reader-muted': theme.muted,
    '--reader-surface': theme.surface, '--reader-border': theme.border, '--reader-accent': theme.accent,
    '--reader-font': `'AfroBooks Ethiopic', ${FONT_FAMILIES[prefs.fontFamily]}`, '--reader-size': FONT_SIZE_PX[prefs.fontSize],
    '--reader-leading': LINE_SPACING_VALUE[prefs.lineSpacing], '--reader-width': MARGIN_MAX_WIDTH[prefs.marginSize], '--reader-gutter': MARGIN_PADDING_X[prefs.marginSize],
    colorScheme: readerTheme === 'paper' || readerTheme === 'sepia' ? 'light' : 'dark',
  } as CSSProperties;

  function navigate(number: number) {
    changeChapter(number); setPanel(null); setControlsVisible(true); lastScroll.current = 0;
    requestAnimationFrame(() => scrollerRef.current?.focus({ preventScroll: true }));
  }
  function turn(direction: -1 | 1) {
    flipPage(direction, () => turnPage(direction));
  }

  return <div className="reader-shell" data-reading-mode={prefs.readingMode} data-reader-focus={focused} data-reader-theme={readerTheme} style={style}>
    {installed && <div className="reader-running-head" aria-hidden="true"><span>{book.title}</span></div>}
    <header ref={toolbarRef} className="reader-toolbar" data-hidden={installed ? focused : !controlsVisible && !panel} inert={focused || undefined} aria-hidden={focused || undefined} aria-label="Reader controls">
      <Link href={`/book/${book.id}`} aria-label="Back to book" title="Back to book" className="reader-icon-button"><ArrowLeft size={20} /></Link>
      <div className="reader-book-identity"><p>{book.title}</p><span>{book.authorName}</span></div>
      <button type="button" className="reader-icon-button" aria-label={paged ? 'Switch to scrolling' : 'Switch to pages'} title={paged ? 'Switch to scrolling' : 'Switch to pages'} onClick={() => prefs.setReadingMode(paged ? 'scroll' : 'pages')}>{paged ? <ScrollText size={20} /> : <BookOpen size={20} />}</button>
      <button type="button" className="reader-icon-button" aria-label="Chapters" title="Chapters" aria-haspopup="dialog" onClick={() => setPanel('chapters')}><List size={21} /></button>
      <button type="button" className="reader-icon-button" aria-label="Reading appearance" title="Reading appearance" aria-haspopup="dialog" onClick={() => setPanel('appearance')}><Type size={21} /></button>
    </header>

    <div ref={scrollerRef} className="reader-viewport" data-reading-mode={prefs.readingMode} data-empty={loading || !!loadError || !chapter} role="main" aria-label="Book reader" tabIndex={0}
      onFocusCapture={event => {
        if (!paged || event.target === event.currentTarget) return;
        const viewport = event.currentTarget;
        const { stride, count } = readerPageMetrics(viewport);
        const rect = event.target.getClientRects()[0];
        if (rect) viewport.scrollLeft = Math.max(0, Math.min(count - 1, Math.floor((rect.left - viewport.getBoundingClientRect().left + viewport.scrollLeft) / stride))) * stride;
      }}
      onScroll={() => {
        if (!onScroll()) return;
        if (paged) return;
        const top = scrollerRef.current?.scrollTop ?? 0;
        if (Math.abs(top - lastScroll.current) > 8 && !toolbarRef.current?.contains(document.activeElement)) setControlsVisible(top < lastScroll.current || top < 80);
        lastScroll.current = top;
      }}
      onClick={event => {
        if (swiped.current) { swiped.current = false; return; }
        if ((event.target as HTMLElement).closest('a, button, input, select, dialog') || window.getSelection()?.toString()) return;
        if (installed) scrollerRef.current?.focus({ preventScroll: true });
        setControlsVisible(visible => !visible);
      }}
      onTouchStart={event => {
        swiped.current = false;
        touchStart.current = paged && event.touches.length === 1 && !(event.target as HTMLElement).closest('a, button, input, select')
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
      }}
      onTouchMove={event => { if (event.touches.length !== 1) touchStart.current = null; }}
      onTouchCancel={() => { touchStart.current = null; }}
      onTouchEnd={event => {
        const start = touchStart.current; touchStart.current = null;
        if (!start || !event.changedTouches.length || window.getSelection()?.toString()) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped.current = true; turn(dx < 0 ? 1 : -1); }
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') setControlsVisible(true);
        if (paged && event.target === event.currentTarget && !event.altKey && !event.ctrlKey && !event.metaKey && !window.getSelection()?.toString()) {
          if (['ArrowRight', 'PageDown', ' '].includes(event.key) && !event.shiftKey) { event.preventDefault(); turn(1); return; }
          if (['ArrowLeft', 'PageUp'].includes(event.key) || event.key === ' ' && event.shiftKey) { event.preventDefault(); turn(-1); return; }
        }
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || window.getSelection()?.toString()) return;
        if (event.key === 'ArrowRight' && next) { event.preventDefault(); navigate(next.chapterNumber); }
        if (event.key === 'ArrowLeft' && previous) { event.preventDefault(); navigate(previous.chapterNumber); }
      }}>
      {loading ? <div className="reader-state" role="status"><span className="reader-loader" />Opening your book…</div>
        : loadError ? <div className="reader-state"><p role="alert">{loadError}</p><button type="button" className="reader-text-button" onClick={retry}>Try again</button></div>
        : !chapter ? <div className="reader-state"><p>{hasAccess ? 'No chapters are available for this book yet.' : 'The author has not made a free preview available for this book.'}</p><Link href={`/book/${book.id}`} className="reader-text-button">Back to book</Link></div>
        : <article className="reader-page" aria-labelledby="reader-chapter-title">
          <header className="reader-chapter-heading">
            <p className="reader-eyebrow">{!hasAccess && <span>Free sample <span aria-hidden="true">·</span> </span>}Chapter {chapter.chapterNumber}</p>
            <h1 id="reader-chapter-title" dir="auto">{chapter.title}</h1>
            <span className="reader-chapter-rule" aria-hidden="true" />
          </header>
          <div ref={bodyRef} dir="auto" className="reader-content" dangerouslySetInnerHTML={{ __html: content }} />
          {!next && !hasAccess && <PreviewGate bookId={book.id} bookTitle={book.title} price={book.price} />}
          {!next && hasAccess && <div className="reader-book-end"><span aria-hidden="true">✦</span><p>You’ve reached the end of this book.</p><Link href={`/book/${book.id}`} className="reader-text-button">Return to book</Link></div>}
          {(previous || next) && <nav className="reader-chapter-navigation" aria-label="Chapter navigation">
            {previous ? <button type="button" className="reader-chapter-link" onClick={() => navigate(previous.chapterNumber)}><ArrowLeft size={18} /><span><small>Previous chapter</small><span>{previous.title}</span></span></button> : <span />}
            {next && <button type="button" className="reader-chapter-link reader-chapter-next" onClick={() => navigate(next.chapterNumber)}><span><small>Next chapter</small><span>{next.title}</span></span><ArrowRight size={18} /></button>}
          </nav>}
        </article>}
    </div>

    {installed && paged && <div ref={turnLayerRef} className="reader-flip-layer" aria-hidden="true" inert />}
    {chapter && !loading && !loadError && <footer className="reader-progress" aria-label="Reading progress">
      {saveError && <div className="reader-sync-message" role="status">{saveError}<button type="button" onClick={retrySave}>Retry save</button></div>}
      {installed ? <MobileReaderProgress paged={paged} page={pagination.page + 1} pages={pagination.count} chapter={index + 1} chapters={chapters.length} percent={totalProgress} minutes={minutesLeft} preview={!hasAccess} focused={focused}
        previous={paged ? pagination.page > 0 || !!previous : !!previous} next={paged ? pagination.page < pagination.count - 1 || !!next : !!next}
        turn={direction => { if (paged) turn(direction); else { const adjacent = direction < 0 ? previous : next; if (adjacent) navigate(adjacent.chapterNumber); } }} reveal={() => setControlsVisible(true)} /> : <>
      {paged && <nav className="reader-page-controls" aria-label="Page navigation">
        <button type="button" className="reader-icon-button" aria-label="Previous page" disabled={pagination.page === 0 && !previous} onClick={() => turnPage(-1)}><ArrowLeft size={20} /></button>
        <span role="status" aria-live="polite">Page {pagination.page + 1} of {pagination.count}<small>in this chapter</small></span>
        <button type="button" className="reader-icon-button" aria-label="Next page" disabled={pagination.page >= pagination.count - 1 && !next} onClick={() => turnPage(1)}><ArrowRight size={20} /></button>
      </nav>}
      <div className="reader-progress-track" aria-hidden="true"><span style={{ width: `${totalProgress}%` }} /></div>
      <div className="reader-progress-labels"><span>{hasAccess ? `Chapter ${index + 1} of ${chapters.length}` : `Preview ${index + 1} of ${chapters.length}`}<span aria-hidden="true"> · </span>{totalProgress}%</span><span>{minutesLeft ? `About ${minutesLeft} min left in chapter` : 'Chapter complete'}</span></div>
      </>}
      {installed && <div className="reader-progress-track" aria-hidden="true"><span style={{ width: `${totalProgress}%` }} /></div>}
    </footer>}
    <p className="sr-only" role="status">{chapter ? `Chapter ${chapter.chapterNumber}: ${chapter.title}` : ''}</p>

    {panel && <ReaderPanel title={panel === 'chapters' ? 'Chapters' : 'Reading appearance'} onClose={() => setPanel(null)}>
      {panel === 'appearance' ? <ReaderAppearance sampleText={sampleText} /> : <>
        <p className="reader-panel-book-title">{book.title}</p>
        {!hasAccess && <p className="reader-panel-note">Showing the chapters available in your free sample.</p>}
        {loading ? <p role="status">Loading chapters…</p> : loadError ? <p role="alert">{loadError}</p> : !chapters.length ? <p>No chapters available.</p> : <ol className="reader-contents">
          {chapters.map(item => <li key={item.id}><button type="button" aria-current={item.chapterNumber === chapterNumber ? 'location' : undefined} onClick={() => navigate(item.chapterNumber)}><span className="reader-contents-number">{String(item.chapterNumber).padStart(2, '0')}</span><span>{item.title}</span>{item.chapterNumber === chapterNumber && <Check size={17} aria-hidden="true" />}</button></li>)}
        </ol>}
      </>}
    </ReaderPanel>}
  </div>;
}
