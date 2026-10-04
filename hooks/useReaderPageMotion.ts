'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** A short-lived, inert copy of the visible page turns over the real reader.
 * Only the copy moves: position saving must measure untransformed book text. */
export function useReaderPageMotion(enabled: boolean, viewport: RefObject<HTMLDivElement | null>, appearance: string) {
  const layer = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const animations = useRef<Animation[]>([]);
  const generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    cancelAnimationFrame(frame.current);
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    layer.current?.replaceChildren();
  }, []);

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => { if (motion.matches) stop(); };
    const onSelection = () => { if (window.getSelection()?.toString()) stop(); };
    const onHidden = () => { if (document.hidden) stop(); };
    const element = viewport.current;
    let width = element?.clientWidth;
    let height = element?.clientHeight;
    const observer = new ResizeObserver(() => {
      if (width !== element?.clientWidth || height !== element?.clientHeight) {
        width = element?.clientWidth; height = element?.clientHeight; stop();
      }
    });
    if (element) observer.observe(element);
    motion.addEventListener('change', onMotion);
    document.addEventListener('selectionchange', onSelection);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      observer.disconnect(); motion.removeEventListener('change', onMotion);
      document.removeEventListener('selectionchange', onSelection);
      document.removeEventListener('visibilitychange', onHidden); stop();
    };
  }, [viewport, stop]);
  useEffect(() => { stop(); }, [enabled, appearance, stop]);

  function turn(direction: -1 | 1, navigate: () => boolean) {
    stop();
    const surface = layer.current;
    const source = viewport.current;
    if (!enabled || !surface || !source?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches || window.getSelection()?.toString()) {
      navigate(); return;
    }

    let oldPage: ReturnType<typeof copyPage> = null;
    // Animation is optional, including on exceptionally large chapters/devices.
    try { oldPage = copyPage(source, surface); } catch { /* Keep navigation available. */ }
    if (!oldPage) { navigate(); return; }
    const scene = div('reader-flip-scene');
    scene.dataset.direction = direction === 1 ? 'next' : 'previous';
    const leaf = div('reader-flip-leaf');
    const front = div('reader-flip-face reader-flip-front');
    const back = div('reader-flip-face reader-flip-back');
    const light = div('reader-flip-light');
    const cast = div('reader-flip-cast');
    leaf.append(front, back);
    scene.append(cast, leaf);
    surface.append(scene);
    if (direction === 1) {
      front.append(oldPage.element, light);
    } else {
      // Keep the departing page underneath until the previous page lands.
      const base = div('reader-flip-base');
      base.append(oldPage.element); scene.prepend(base);
      leaf.style.transform = 'rotateY(-150deg)';
    }
    oldPage.restoreOffset();
    if (!navigate()) { stop(); return; }
    const current = generation.current;
    // React commits an adjacent chapter and restores its last/first column
    // before this frame. Never preload chapters to create the animation.
    frame.current = requestAnimationFrame(() => {
      if (current !== generation.current) return;
      try {
        if (direction === -1) {
          const target = copyPage(source, surface);
          if (!target) { stop(); return; }
          front.append(target.element, light); target.restoreOffset();
        }
        const poses = [
          { transform: 'rotateY(0deg)', offset: 0 },
          { transform: 'rotateY(-42deg)', offset: .35 },
          { transform: 'rotateY(-105deg)', offset: .75 },
          { transform: 'rotateY(-150deg)', offset: 1 },
        ];
        const timing: KeyframeAnimationOptions = { duration: 460, easing: 'cubic-bezier(.25,.65,.3,1)', fill: 'both', direction: direction === 1 ? 'normal' : 'reverse' };
        animations.current = [
          leaf.animate(poses, timing),
          light.animate([{ opacity: 0 }, { opacity: .8, offset: .5 }, { opacity: .2 }], timing),
          cast.animate([{ opacity: 0 }, { opacity: .65, offset: .4 }, { opacity: 0 }], timing),
        ];
        void animations.current[0].finished.then(() => {
          if (current === generation.current) stop();
        }, () => { /* Cancellation is normal when turning quickly or rotating. */ });
      } catch { stop(); }
    });
  }
  return { layer, turn };
}

function div(className: string) {
  const element = document.createElement('div'); element.className = className; return element;
}

function copyPage(source: HTMLDivElement, surface: HTMLDivElement) {
  if (!source.querySelector('.reader-page')) return null;
  // Bound temporary DOM work. A long/unusually complex chapter still turns
  // immediately; it should never freeze a phone just to draw a paper effect.
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let nodes = 0; let characters = 0;
  while (walker.nextNode()) {
    nodes++;
    if (walker.currentNode.nodeType === Node.TEXT_NODE) characters += walker.currentNode.textContent?.length ?? 0;
    if (nodes > 2000 || characters > 200_000) return null;
  }
  const rect = source.getBoundingClientRect();
  const shell = surface.parentElement?.getBoundingClientRect();
  if (!shell || !rect.width || !rect.height) return null;
  Object.assign(surface.style, { top: `${rect.top - shell.top - 8}px`, height: `${rect.height + 16}px` });
  const element = source.cloneNode(true) as HTMLDivElement;
  element.dataset.readerSnapshot = 'true';
  element.inert = true;
  // Cloned DOM must not duplicate IDs, live regions or interactive controls.
  for (const node of [element, ...element.querySelectorAll<HTMLElement>('*')]) {
    for (const attr of Array.from(node.attributes)) {
      if (['id', 'name', 'role', 'tabindex', 'href'].includes(attr.name) || attr.name.startsWith('aria-')) node.removeAttribute(attr.name);
    }
  }
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, {
    position: 'absolute', inset: 'auto', left: `${rect.left - shell.left}px`, top: '8px',
    width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', overflow: 'hidden', pointerEvents: 'none',
  });
  const left = source.scrollLeft; const top = source.scrollTop;
  return { element, restoreOffset: () => { element.scrollLeft = left; element.scrollTop = top; } };
}
