'use client';

import './author-return.css';
import { useEffect, useRef, useSyncExternalStore, type MouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAuthorWebsite } from '@/lib/app/installed';
import { readerAppHref, READER_APP_RETURN } from '@/lib/app/authorWebsite';
import { useAndroidDevice } from '@/hooks/useAndroidDevice';

const subscribe = () => () => {};

export default function AuthorReturnBar() {
  usePathname(); // Recheck after client-side author/login navigation.
  const visible = useSyncExternalStore(subscribe, isAuthorWebsite, () => false);
  const android = useAndroidDevice();
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!visible || !element) return;
    const update = () => document.documentElement.style.setProperty('--author-return-height', `${element.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(update);observer.observe(element);update();
    return () => { observer.disconnect();document.documentElement.style.removeProperty('--author-return-height'); };
  }, [visible]);

  function returnToReader(event: MouseEvent<HTMLAnchorElement>) {
    if (android || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Web-opened tabs can close back to the reader. If the browser reused the
    // app window or refuses to close, restore reader presentation in this tab.
    try { window.close(); } catch { /* Fall through to the local reader. */ }
    setTimeout(() => { if (!window.closed) window.location.replace(READER_APP_RETURN); }, 120);
  }

  if (!visible) return null;
  return <aside ref={bar} className="author-return-bar" aria-label="Return to AfroBooks app">
    <span>AfroBooks website</span>
    <a href={readerAppHref(android)} onClick={returnToReader}><ArrowLeft size={17} />Back to app</a>
  </aside>;
}
