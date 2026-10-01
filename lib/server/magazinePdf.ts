import type { Firestore } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import { PDFDocument } from 'pdf-lib';

export const MAX_MAGAZINE_PDF_BYTES = 20 * 1024 * 1024;
export interface MagazineFile { sellerId: string; path: string; generation: string; pageCount: number; size: number }

export async function inspectMagazinePdf(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_MAGAZINE_PDF_BYTES || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') throw new Error('Upload a PDF of 20 MB or less.');
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageCount = pdf.getPageCount();
  if (pageCount < 1 || pageCount > 500) throw new Error('Magazines must have between 1 and 500 pages.');
  return pageCount;
}

export async function verifyMagazinePdf(db: Firestore, bucket: Bucket, bookId: string, sellerId: string, path: string) {
  const prefix = `magazines/${sellerId}/${bookId}/`;
  if (!path.startsWith(prefix) || !/^[a-zA-Z0-9-]+\.pdf$/.test(path.slice(prefix.length))) throw new Error('Invalid magazine upload.');
  const ref = db.doc(`books/${bookId}`);
  const book = (await ref.get()).data();
  if (!book || book.sellerId !== sellerId || book.status !== 'draft' || book.publicationType !== 'magazine' || book.contentFormat !== 'pdf') throw new Error('Save your own magazine draft before uploading a PDF.');
  const file = bucket.file(path);
  const [metadata] = await file.getMetadata();
  if (metadata.contentType !== 'application/pdf' || Number(metadata.size) > MAX_MAGAZINE_PDF_BYTES) throw new Error('Upload a PDF of 20 MB or less.');
  const generation = String(metadata.generation);
  const [bytes] = await bucket.file(path, { generation }).download();
  let pageCount: number;
  try { pageCount = await inspectMagazinePdf(bytes); }
  catch { throw new Error('This PDF could not be read. Use an unencrypted PDF with 1–500 pages, up to 20 MB.'); }
  const record: MagazineFile = { sellerId, path, generation, pageCount, size: bytes.length };
  await db.runTransaction(async tx => {
    const [current, deletion] = await Promise.all([tx.get(ref), tx.get(db.doc(`bookDeletions/${bookId}`))]);
    if (deletion.exists || current.data()?.sellerId !== sellerId || current.data()?.status !== 'draft' || current.data()?.contentFormat !== 'pdf') throw new Error('The magazine draft changed. Please retry.');
    tx.set(db.doc(`publicationFiles/${bookId}`), record);
    tx.update(ref, { pdfPageCount: pageCount });
  });
  return { pageCount };
}

export async function authorizedMagazineFile(db: Firestore, bookId: string, user: { uid: string; role: string }) {
  const [snapshot, file, library, deletion] = await Promise.all([
    db.doc(`books/${bookId}`).get(), db.doc(`publicationFiles/${bookId}`).get(),
    db.doc(`library/${user.uid}_${bookId}`).get(), db.doc(`bookDeletions/${bookId}`).get(),
  ]);
  const book = snapshot.data();
  const privileged = book?.sellerId === user.uid || user.role === 'admin';
  if (!book || deletion.exists || book.deletionPending || book.status === 'removed' || book.publicationType !== 'magazine' || book.contentFormat !== 'pdf' ||
      (!privileged && (book.status !== 'live' || !library.exists || library.data()?.userId !== user.uid || library.data()?.bookId !== bookId || !['bought','free_copy'].includes(library.data()?.purchaseType)))) throw new Error('Magazine access unavailable');
  const record = file.data() as MagazineFile | undefined;
  if (!record || record.sellerId !== book.sellerId || !record.path.startsWith(`magazines/${book.sellerId}/${bookId}/`) || !record.generation) throw new Error('Magazine file unavailable');
  return record;
}
