'use client';
import { useEffect, useRef } from 'react';

export function useWatchHeaderOffset() {
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = main.current, header = element?.previousElementSibling;
    if (!element || !header) return;
    const measure = () => element.style.setProperty('--watch-header-height', `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(header); measure();
    return () => observer.disconnect();
  }, []);
  return main;
}
