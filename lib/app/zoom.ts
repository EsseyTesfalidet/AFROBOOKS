/** Keep Next's viewport options while fixing installed app pages at 1×. */
export function lockedAppViewport(content: string): string {
  const parts = content.split(',').map(part => part.trim()).filter(part => part &&
    !/^(?:initial-scale|minimum-scale|maximum-scale|user-scalable)\s*=/i.test(part));
  if (!parts.some(part => /^width\s*=/i.test(part))) parts.unshift('width=device-width');
  return [...parts, 'initial-scale=1', 'minimum-scale=1', 'maximum-scale=1', 'user-scalable=no'].join(', ');
}

/** Called only in installed mode. Restore metadata and listeners on mode exit. */
export function lockInstalledAppZoom(): () => void {
  const snapshots = new Map<HTMLMetaElement, { original: string | null; applied: string }>();
  function syncViewport() {
    snapshots.forEach((_value, meta) => { if (!meta.isConnected) snapshots.delete(meta); });
    document.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]').forEach(meta => {
      const content = meta.getAttribute('content');
      if (snapshots.get(meta)?.applied === content) return;
      const applied = lockedAppViewport(content ?? '');
      snapshots.set(meta, { original: content, applied });
      if (content !== applied) meta.setAttribute('content', applied);
    });
  }
  syncViewport();
  // Next may replace viewport metadata during navigation. Keep its other options.
  const observer = new MutationObserver(syncViewport);
  observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });

  function stopGesture(event: Event) { if (event.cancelable) event.preventDefault(); }
  function stopTrackpadZoom(event: WheelEvent) { if (event.ctrlKey) stopGesture(event); }
  // WebKit supplies gesture events; Chromium uses CSS and viewport constraints.
  document.addEventListener('gesturestart', stopGesture, { passive: false });
  document.addEventListener('gesturechange', stopGesture, { passive: false });
  document.addEventListener('wheel', stopTrackpadZoom, { passive: false });

  return () => {
    observer.disconnect();
    document.removeEventListener('gesturestart', stopGesture);
    document.removeEventListener('gesturechange', stopGesture);
    document.removeEventListener('wheel', stopTrackpadZoom);
    snapshots.forEach(({ original, applied }, meta) => {
      if (!meta.isConnected || meta.getAttribute('content') !== applied) return;
      if (original === null) meta.removeAttribute('content');
      else meta.setAttribute('content', original);
    });
  };
}
