'use client';

import { useEffect } from 'react';

export default function MobileKeyboard() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let baseline = window.innerHeight;
    let width = window.innerWidth;
    let timer: ReturnType<typeof setTimeout>;
    function update() {
      if (!viewport) return;
      const element = document.activeElement as HTMLElement | null;
      const editing = !!element?.matches('textarea, select, input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]), [contenteditable="true"], iframe');
      // Moving focus between fields must not adopt the keyboard's reduced height
      // as the full viewport (Android can resize both viewports).
      if (width !== window.innerWidth) { width = window.innerWidth; baseline = window.innerHeight; }
      baseline = Math.max(baseline, window.innerHeight);
      const open = editing && viewport.scale < 1.1 && baseline - viewport.height > 120;
      root.dataset.keyboardOpen = String(open);
      root.style.setProperty('--visual-height', `${viewport.height}px`);
      root.style.setProperty('--visual-top', `${viewport.offsetTop}px`);
      clearTimeout(timer);
      if (open && element) timer = setTimeout(() => {
        if (document.activeElement !== element || element.isContentEditable) return;
        const rect = element.getBoundingClientRect();
        if (rect.bottom > viewport.offsetTop + viewport.height - 20 || rect.top < viewport.offsetTop + 16) {
          element.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
      }, 80);
    }
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      clearTimeout(timer);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      delete root.dataset.keyboardOpen;
      root.style.removeProperty('--visual-height'); root.style.removeProperty('--visual-top');
    };
  }, []);
  return null;
}
