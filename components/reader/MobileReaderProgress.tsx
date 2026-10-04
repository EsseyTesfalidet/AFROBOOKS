'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useReaderStore, type ProgressDisplay } from '@/store/readerStore';

interface Props {
  paged: boolean; page: number; pages: number; chapter: number; chapters: number;
  percent: number; minutes: number; preview: boolean; focused: boolean;
  previous: boolean; next: boolean; turn: (direction: -1 | 1) => void; reveal: () => void;
}

export default function MobileReaderProgress(props: Props) {
  const { progressDisplay, setProgressDisplay } = useReaderStore();
  const display: Record<ProgressDisplay, string> = {
    page: props.paged ? `Page ${props.page} of ${props.pages}` : `Chapter ${props.chapter} of ${props.chapters}`,
    percent: `${props.percent}% ${props.preview ? 'of sample' : 'of book'}`,
    time: props.minutes ? `About ${props.minutes} min left` : 'Chapter complete',
  };
  const next: Record<ProgressDisplay, ProgressDisplay> = { page: 'percent', percent: 'time', time: 'page' };
  const nextLabel = { page: props.paged ? 'page number' : 'chapter number', percent: 'percentage', time: 'time remaining' };
  return <>
    <nav className="reader-mobile-controls" aria-label={props.paged ? 'Page navigation' : 'Chapter navigation'} inert={props.focused || undefined} aria-hidden={props.focused || undefined}>
      <button type="button" className="reader-icon-button" aria-label={props.paged ? 'Previous page' : 'Previous chapter'} disabled={!props.previous} onClick={() => props.turn(-1)}><ArrowLeft size={18}/></button>
      <button type="button" className="reader-progress-choice" aria-label={`Reading progress: ${display[progressDisplay]}. Show ${nextLabel[next[progressDisplay]]}.`} onClick={() => setProgressDisplay(next[progressDisplay])}>
        <span aria-live="polite">{display[progressDisplay]}</span>
        <small>{progressDisplay === 'page' && props.paged ? 'in this chapter' : progressDisplay === 'time' ? 'in this chapter · estimated' : 'tap to change'}</small>
      </button>
      <button type="button" className="reader-icon-button" aria-label={props.paged ? 'Next page' : 'Next chapter'} disabled={!props.next} onClick={() => props.turn(1)}><ArrowRight size={18}/></button>
    </nav>
    {props.focused && <button type="button" className="reader-focus-progress" aria-label="Show reader controls" onClick={props.reveal}>{props.paged ? props.page : `${props.percent}%`}<span aria-hidden="true"> · </span>{props.preview ? 'Sample' : props.paged ? `${props.percent}%` : 'Reading'}</button>}
  </>;
}
