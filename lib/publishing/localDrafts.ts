import { z } from 'zod';

const chapter = z.object({ chapterNumber: z.number().int().positive(), title: z.string(), content: z.string(), wordCount: z.number().nonnegative(), isPreview: z.boolean() });
const file = z.custom<File | null>(value => value === null || (typeof File !== 'undefined' && value instanceof File));
export const publicationDraftSchema = z.object({
  title: z.string(), authorName: z.string(), description: z.string(), genre: z.string(), language: z.string(),
  publicationType: z.enum(['book', 'magazine', 'short_story']), issueLabel: z.string(), contentFormat: z.enum(['text', 'pdf']),
  ageGroup: z.enum(['all', 'children', 'teen', 'adult']), isbn: z.string(),
  copyrightBasis: z.enum(['original', 'licensed', 'public_domain', 'commissioned', 'other']), copyrightDetails: z.string(), copyrightAttested: z.boolean(),
  accentColor: z.string(), bgColor: z.string(), chapters: z.array(chapter),
  manuscriptFileName: z.string(), manuscriptFile: file, pdfFile: file, pdfPageCount: z.number().nonnegative(), coverFile: file,
  price: z.number().int().nonnegative(), publishMode: z.enum(['now', 'draft', 'preorder']), releaseDate: z.string(),
  step: z.number().int().min(0).max(4), editorDraft: chapter.omit({ isPreview: true }).nullable(), editingChapter: z.number().int().positive().nullable(),
  savedBookId: z.string().regex(/^[^/]+$/).nullable(),
});
export type PublicationDraft = z.infer<typeof publicationDraftSchema>;
const fileFields = ['coverFile', 'manuscriptFile', 'pdfFile'] as const;
const checkpointKey = (key: string) => `afrobooks-author-recovery-${key}`;
const fileIdentity = (value: File | null) => value ? JSON.stringify([value.name, value.size, value.lastModified, value.type]) : null;

// A small synchronous text checkpoint protects the last keystroke during a
// reload. File bytes remain in IndexedDB; never stringify binary uploads.
export function checkpointPublicationDraft(key: string, value: PublicationDraft) {
  try {
    const files = Object.fromEntries(fileFields.map(field => [field, fileIdentity(value[field])]));
    localStorage.setItem(checkpointKey(key), JSON.stringify({ version: 1, updatedAt: Date.now(), files,
      value: { ...value, coverFile: null, manuscriptFile: null, pdfFile: null } }));
  } catch { /* Quota/private-mode restrictions: the normal IndexedDB save still runs. */ }
}

let database: Promise<IDBDatabase> | undefined;
let connection: IDBDatabase | undefined;
function open() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('afrobooks-author-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => {
      const db = request.result;
      connection = db;
      db.onversionchange = () => { db.close(); database = undefined; connection = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Draft storage is busy. Close other AfroBooks tabs and retry.'));
  }).catch(error => { database = undefined; throw error; });
  return database;
}

function transaction<T>(key: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = (db: IDBDatabase) => {
      try {
        const tx = db.transaction('drafts', mode);
        const request = action(tx.objectStore('drafts'));
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error ?? new Error('Unable to save draft on this device.'));
        tx.onerror = () => reject(tx.error);
      } catch (error) { reject(error); }
    };
    // On pagehide, start the transaction in the event itself. Scheduling it in
    // a promise continuation can lose the last edit when the document unloads.
    if (connection) start(connection); else void open().then(start, reject);
  });
}

export function publicationDraftKey(userId: string, bookId: string | null) {
  return JSON.stringify([userId, bookId]);
}
export async function readPublicationDraft(key: string): Promise<PublicationDraft | null> {
  const saved = await transaction(key, 'readonly', store => store.get(key));
  let checkpoint;
  try { checkpoint = JSON.parse(localStorage.getItem(checkpointKey(key)) ?? 'null'); } catch { /* IndexedDB can still be available. */ }
  if (checkpoint?.version === 1 && Number.isFinite(checkpoint.updatedAt) && checkpoint.updatedAt >= (saved?.updatedAt ?? 0)) {
    const restored = publicationDraftSchema.parse(checkpoint.value);
    for (const field of fileFields) {
      const previous = saved?.value?.[field];
      restored[field] = previous instanceof File && fileIdentity(previous) === checkpoint.files?.[field] ? previous : null;
    }
    // A newly selected magazine must not silently fall back to an older PDF.
    if (checkpoint.files?.pdfFile && !restored.pdfFile) restored.pdfPageCount = 0;
    return restored;
  }
  if (!saved) return null;
  if (saved.version !== 1) throw new Error('This saved draft needs a newer version of AfroBooks.');
  return publicationDraftSchema.parse(saved.value);
}
export async function writePublicationDraft(key: string, value: PublicationDraft) {
  await transaction(key, 'readwrite', store => store.put({ version: 1, value, updatedAt: Date.now() }, key));
}
export async function deletePublicationDraft(key: string) {
  localStorage.removeItem(checkpointKey(key));
  await transaction(key, 'readwrite', store => store.delete(key));
}
