export const WATCH_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export function streamPlaybackSource(token: string) {
  // Keep the signed bearer token in the path; never fall back to a public asset ID.
  return `https://videodelivery.net/${encodeURIComponent(token)}/manifest/video.m3u8`;
}

// The player already holds authorized, expiring access to this exact video.
// Vidstack loads the current preview image as the user scrubs, not all frames.
export function streamScrubThumbnails(token: string, duration: number) {
  if (!token || !Number.isFinite(duration) || duration <= 0) return [];
  const count = Math.min(120, Math.ceil(duration / 5));
  const step = duration / count;
  return Array.from({ length: count }, (_, index) => ({
    url: `https://videodelivery.net/${encodeURIComponent(token)}/thumbnails/thumbnail.jpg?time=${(index * step).toFixed(3)}s&width=320&height=180&fit=crop`,
    startTime: index * step, endTime: (index + 1) * step, width: 320, height: 180,
  }));
}

export function playbackPosition(seconds: number, duration: number) {
  return Number.isFinite(seconds) && Number.isFinite(duration) && duration > 0 ? Math.min(duration, Math.max(0, seconds)) : 0;
}

export function playbackStart(seconds: number, duration: number) {
  const position = playbackPosition(seconds, duration);
  // A short clip should not be considered finished after only a second or two.
  return position >= duration - Math.min(5, duration * 0.05) ? 0 : position;
}

/** Serialize writes so a slow earlier save cannot overwrite a later pause/seek. */
export function createWatchProgress(options: {
  initial: number; duration: number; write: (seconds: number) => Promise<unknown>;
  isCurrent: () => boolean; onResult: (saved: boolean) => void; now?: () => number;
}) {
  let seconds = playbackPosition(options.initial, options.duration);
  let saved = seconds;
  let dirty = false;
  let lastAttempt = -Infinity;
  let pending: Promise<void> | null = null;
  let queued = false;
  const now = options.now ?? Date.now;
  function flush(force = false): Promise<void> {
    if (!options.isCurrent() || !dirty) return pending ?? Promise.resolve();
    if (pending) { queued ||= force; return pending; }
    if (Math.abs(seconds - saved) < 0.5) return Promise.resolve();
    if (!force && now() - lastAttempt < 15000) return Promise.resolve();
    const snapshot = seconds;
    lastAttempt = now();
    pending = Promise.resolve().then(() => {
      if (!options.isCurrent()) return;
      return options.write(snapshot).then(() => { saved = snapshot; options.onResult(true); });
    }).catch(() => options.onResult(false)).finally(() => {
      pending = null;
      if (queued) { queued = false; void flush(true); }
    });
    return pending;
  }
  return {
    record(value: number) { if (Number.isFinite(value)) { seconds = playbackPosition(value, options.duration); dirty = true; } },
    flush,
  };
}
