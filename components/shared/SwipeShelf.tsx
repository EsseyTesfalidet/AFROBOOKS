'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { EmblaCarouselType } from 'embla-carousel';
import { useInstalledApp } from '@/hooks/useInstalledApp';

interface Props { children: ReactNode; label: string; className: string; style?: CSSProperties }

export default function SwipeShelf({ children, label, className, style }: Props) {
  const installed = useInstalledApp();
  const viewport = useRef<HTMLDivElement>(null);
  const carousel = useRef<EmblaCarouselType | null>(null);
  const [state, setState] = useState({ ready: false, previous: false, next: false, range: '' });

  useEffect(() => {
    const node = viewport.current;
    if (!installed || !node) return;
    let active = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    function update(api: EmblaCarouselType) {
      const visible = api.slidesInView();
      setState({ ready: true, previous: api.canScrollPrev(), next: api.canScrollNext(),
        range: visible.length ? `${visible[0] + 1}–${visible[visible.length - 1] + 1} of ${api.slideNodes().length}` : '' });
    }
    // Load interaction code only for the installed app. Native overflow remains
    // available until it loads, and remains the website's scrolling behavior.
    void Promise.all([import('embla-carousel'), import('embla-carousel-wheel-gestures')]).then(([{ default: Embla }, { WheelGesturesPlugin }]) => {
      if (!active) return;
      const api = Embla(node, { align: 'start', loop: false, containScroll: 'trimSnaps',
        dragFree: !reduced.matches, duration: reduced.matches ? 0 : 25, inViewThreshold: 0.5 },
        [WheelGesturesPlugin({ forceWheelAxis: 'x' })]);
      carousel.current = api;
      api.on('select', update).on('slidesInView', update).on('reInit', update);
      update(api);
    }).catch(() => { /* Swipe/trackpad native overflow still works if the chunk is unavailable. */ });
    return () => { active = false; carousel.current?.destroy(); carousel.current = null; };
  }, [installed]);

  function move(direction: -1 | 1) {
    const jump = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (direction < 0) carousel.current?.scrollPrev(jump); else carousel.current?.scrollNext(jump);
  }

  if (!installed) return <div className={className} style={style} tabIndex={0} role="region" aria-label={label}>{children}</div>;

  return <div className="app-swipe-shelf" data-ready={state.ready}>
    <div ref={viewport} className="app-shelf-viewport" role="region" aria-roledescription="carousel" aria-label={label} tabIndex={0}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !carousel.current) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
        if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); carousel.current.scrollTo(event.key === 'Home' ? 0 : carousel.current.scrollSnapList().length - 1, true); }
      }}>
      <div className={`${className} app-shelf-track`} style={style}>{children}</div>
    </div>
    {state.ready && (state.previous || state.next) && <div className="app-shelf-controls">
      <span aria-hidden="true">{state.range}</span>
      <div>
        <button type="button" disabled={!state.previous} aria-label={`Previous in ${label}`} onClick={() => move(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <button type="button" disabled={!state.next} aria-label={`Next in ${label}`} onClick={() => move(1)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </div>}
  </div>;
}
