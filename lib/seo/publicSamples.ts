import { DomUtils, parseDocument } from 'htmlparser2';
import { sanitizeChapter } from '@/lib/utils/sanitizeChapter';

export function bookSampleAllowed(book: Record<string, unknown>, now = Date.now()) {
  if (book.status !== 'live' || book.deletionPending === true || book.contentFormat === 'pdf') return false;
  if (!book.isPreorder) return true;
  const date = book.releaseDate;
  const time = date && typeof date === 'object' && 'toMillis' in date && typeof date.toMillis === 'function' ? date.toMillis() : NaN;
  return Number.isFinite(time) && time <= now;
}

export function bookSampleText(html: string) {
  const clean = sanitizeChapter(html).replace(/<\/(?:p|h[1-6]|li|blockquote|pre)>/gi, '$&\n\n').replace(/<br\s*\/?\s*>/gi, '\n');
  const text = DomUtils.textContent(parseDocument(clean)).replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const characters = Array.from(text);
  return characters.length > 2400 ? `${characters.slice(0, 2400).join('').trimEnd()}…` : text;
}

// No caller can pass a storage URL or choose a full recording/part path.
export function publicAudioSamplePath(title: Record<string, unknown>) {
  const segment = /^[A-Za-z0-9_-]{1,128}$/;
  if (title.status !== 'published' || title.ready !== true || title.previewReady !== true
    || typeof title.creatorId !== 'string' || !segment.test(title.creatorId)
    || typeof title.id !== 'string' || !segment.test(title.id)
    || typeof title.previewVersion !== 'string' || !segment.test(title.previewVersion)
    || typeof title.previewSeconds !== 'number' || !Number.isFinite(title.previewSeconds)
    || title.previewSeconds <= 0 || title.previewSeconds > 60) return null;
  return `audio/${title.creatorId}/${title.id}/preview-${title.previewVersion}.mp3`;
}
