'use client';

import './reader.css';

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, List, Type, Check } from 'lucide-react';
import { sanitizeChapter } from '@/lib/utils/sanitizeChapter';
import { calculateReadingProgress } from '@/lib/utils/readingProgress';
import { useReaderSession } from '@/hooks/useReaderSession';
import { useReaderStore, THEME_STYLES, FONT_SIZE_PX, LINE_SPACING_VALUE, FONT_FAMILIES, MARGIN_MAX_WIDTH, MARGIN_PADDING_X } from '@/store/readerStore';
import type { Book } from '@/types/book';
import ReaderPanel from './ReaderPanel';
import ReaderAppearance from './ReaderAppearance';
import PreviewGate from './PreviewGate';

interface Props { book: Book; userId: string | null; hasAccess: boolean }

export default function InAppReader({ book, userId, hasAccess }: Props) {
  const prefs = useReaderStore();
  const { chapters, chapter: chapterNumber, loading, loadError, saveError, percent, scrollerRef, bodyRef, changeChapter, onScroll, retry, retrySave } = useReaderSession(book.id, userId, hasAccess, `${prefs.fontSize}:${prefs.lineSpacing}:${prefs.fontFamily}:${prefs.marginSize}`);
  const [panel, setPanel] = useState<'chapters' | 'appearance' | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const lastScroll = useRef(0);
  const toolbarRef = useRef<HTMLElement>(null);
  const index = chapters.findIndex(chapter => chapter.chapterNumber === chapterNumber);
  const chapter = chapters[index];
  const previous = chapters[index - 1];
  const next = chapters[index + 1];
  const content = useMemo(() => sanitizeChapter(chapter?.content ?? ''), [chapter?.content]);
  const wordCount = useMemo(() => content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, [content]);
  const minutesLeft = Math.ceil(wordCount * (1 - percent / 100) / 238);
  const totalProgress = calculateReadingProgress(index, chapters.length, percent, hasAccess).percentComplete;
  const theme = THEME_STYLES[prefs.theme];
  const style = {
    '--reader-bg': theme.bg, '--reader-text': theme.text, '--reader-muted': theme.muted,
    '--reader-surface': theme.surface, '--reader-border': theme.border, '--reader-accent': theme.accent,
    '--reader-font': FONT_FAMILIES[prefs.fontFamily], '--reader-size': FONT_SIZE_PX[prefs.fontSize],
    '--reader-leading': LINE_SPACING_VALUE[prefs.lineSpacing], '--reader-width': MARGIN_MAX_WIDTH[prefs.marginSize], '--reader-gutter': MARGIN_PADDING_X[prefs.marginSize],
    colorScheme: prefs.theme === 'paper' || prefs.theme === 'sepia' ? 'light' : 'dark',
  } as CSSProperties;

  function navigate(number: number) {
    changeChapter(number); setPanel(null); setControlsVisible(true); lastScroll.current = 0;
    requestAnimationFrame(() => scrollerRef.current?.focus({ preventScroll: true }));
  }

  return <div className="reader-shell" style={style}>
    <header ref={toolbarRef} className="reader-toolbar" data-hidden={!controlsVisible && !panel} aria-label="Reader controls">
      <Link href={`/book/${book.id}`} aria-label="Back to book" title="Back to book" className="reader-icon-button"><ArrowLeft size={20} /></Link>
      <div className="reader-book-identity"><p>{book.title}</p><span>{book.authorName}</span></div>
      <button type="button" className="reader-icon-button" aria-label="Chapters" title="Chapters" aria-haspopup="dialog" onClick={() => setPanel('chapters')}><List size={21} /></button>
      <button type="button" className="reader-icon-button" aria-label="Reading appearance" title="Reading appearance" aria-haspopup="dialog" onClick={() => setPanel('appearance')}><Type size={21} /></button>
    </header>

    <div ref={scrollerRef} className="reader-viewport" role="main" aria-label="Book reader" tabIndex={0}
      onScroll={() => {
        if (!onScroll()) return;
        const top = scrollerRef.current?.scrollTop ?? 0;
        if (Math.abs(top - lastScroll.current) > 8 && !toolbarRef.current?.contains(document.activeElement)) setControlsVisible(top < lastScroll.current || top < 80);
        lastScroll.current = top;
      }}
      onClick={event => {
        if ((event.target as HTMLElement).closest('a, button, input, select, dialog') || window.getSelection()?.toString()) return;
        setControlsVisible(visible => !visible);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') setControlsVisible(true);
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
            <h1 id="reader-chapter-title">{chapter.title}</h1>
            <span className="reader-chapter-rule" aria-hidden="true" />
          </header>
          <div ref={bodyRef} className="reader-content" dangerouslySetInnerHTML={{ __html: content }} />
          {!next && !hasAccess && <PreviewGate bookId={book.id} bookTitle={book.title} price={book.price} />}
          {!next && hasAccess && <div className="reader-book-end"><span aria-hidden="true">✦</span><p>You’ve reached the end of this book.</p><Link href={`/book/${book.id}`} className="reader-text-button">Return to book</Link></div>}
          {(previous || next) && <nav className="reader-chapter-navigation" aria-label="Chapter navigation">
            {previous ? <button type="button" className="reader-chapter-link" onClick={() => navigate(previous.chapterNumber)}><ArrowLeft size={18} /><span><small>Previous chapter</small><span>{previous.title}</span></span></button> : <span />}
            {next && <button type="button" className="reader-chapter-link reader-chapter-next" onClick={() => navigate(next.chapterNumber)}><span><small>Next chapter</small><span>{next.title}</span></span><ArrowRight size={18} /></button>}
          </nav>}
        </article>}
    </div>

    {chapter && !loading && !loadError && <footer className="reader-progress" aria-label="Reading progress">
      {saveError && <div className="reader-sync-message" role="status">{saveError}<button type="button" onClick={retrySave}>Retry save</button></div>}
      <div className="reader-progress-track" aria-hidden="true"><span style={{ width: `${totalProgress}%` }} /></div>
      <div className="reader-progress-labels"><span>{hasAccess ? `Chapter ${index + 1} of ${chapters.length}` : `Preview ${index + 1} of ${chapters.length}`}<span aria-hidden="true"> · </span>{totalProgress}%</span><span>{minutesLeft ? `About ${minutesLeft} min left in chapter` : 'Chapter complete'}</span></div>
    </footer>}
    <p className="sr-only" role="status">{chapter ? `Chapter ${chapter.chapterNumber}: ${chapter.title}` : ''}</p>

    {panel && <ReaderPanel title={panel === 'chapters' ? 'Chapters' : 'Reading appearance'} onClose={() => setPanel(null)}>
      {panel === 'appearance' ? <ReaderAppearance /> : <>
        <p className="reader-panel-book-title">{book.title}</p>
        {!hasAccess && <p className="reader-panel-note">Showing the chapters available in your free sample.</p>}
        {loading ? <p role="status">Loading chapters…</p> : loadError ? <p role="alert">{loadError}</p> : !chapters.length ? <p>No chapters available.</p> : <ol className="reader-contents">
          {chapters.map(item => <li key={item.id}><button type="button" aria-current={item.chapterNumber === chapterNumber ? 'location' : undefined} onClick={() => navigate(item.chapterNumber)}><span className="reader-contents-number">{String(item.chapterNumber).padStart(2, '0')}</span><span>{item.title}</span>{item.chapterNumber === chapterNumber && <Check size={17} aria-hidden="true" />}</button></li>)}
        </ol>}
      </>}
    </ReaderPanel>}
  </div>;
}
