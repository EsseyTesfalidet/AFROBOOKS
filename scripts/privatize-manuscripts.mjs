// Dry run by default. After the release checks pass:
// node --env-file=.env.local scripts/privatize-manuscripts.mjs --apply
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const credentials = JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || '{}');
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!projectId || credentials.project_id !== projectId || !bucketName) throw new Error('Check project credentials and storage bucket.');
initializeApp({ credential: cert(credentials), projectId, storageBucket: bucketName });
const db = getFirestore();
const bucket = getStorage().bucket();
const apply = process.argv.includes('--apply');
let changed = 0;
let errors = 0;
const books = await db.collection('books').get();
for (const book of books.docs) {
  const data = book.data();
  if (!data.manuscriptUrl) continue;
  try {
    const url = new URL(data.manuscriptUrl);
    const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname);
    if (url.hostname !== 'firebasestorage.googleapis.com' || !match || decodeURIComponent(match[1]) !== bucketName) throw new Error('Unexpected archive location');
    const path = decodeURIComponent(match[2]);
    if (!path.startsWith(`manuscripts/${data.sellerId}/${book.id}/`) || path.includes('..')) throw new Error('Unexpected archive path');
    const file = bucket.file(path);
    const [metadata] = await file.getMetadata();
    if (apply) {
      await db.runTransaction(async tx => {
        const latest = (await tx.get(book.ref)).data();
        const privateRef = db.doc(`privateBooks/${book.id}`);
        const existing = (await tx.get(privateRef)).data();
        if (latest?.manuscriptUrl !== data.manuscriptUrl) throw new Error('Book changed; retry migration');
        if (existing?.manuscriptPath && existing.manuscriptPath !== path) throw new Error('Archive changed; reconcile before migration');
        tx.set(privateRef, { sellerId: data.sellerId, manuscriptPath: path });
      });
      // Only remove the download token. Preserve the original object and metadata.
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
      const [verified] = await file.getMetadata();
      if (verified.metadata?.firebaseStorageDownloadTokens) throw new Error('Token revocation unconfirmed');
      const anonymous = await fetch(data.manuscriptUrl, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (![401, 403, 404].includes(anonymous.status)) throw new Error('Anonymous access revocation unconfirmed');
      await db.runTransaction(async tx => {
        const latest = (await tx.get(book.ref)).data();
        if (latest?.manuscriptUrl !== data.manuscriptUrl) throw new Error('Book changed; retry migration');
        tx.update(book.ref, { manuscriptUrl: FieldValue.delete() });
        tx.set(db.doc(`maintenanceActions/private-manuscript-${book.id}`), {
          bookId: book.id, action: 'privatize-manuscript', completedAt: FieldValue.serverTimestamp(),
        });
      });
    }
    changed++;
    console.log(JSON.stringify({ bookId: book.id, action: apply ? 'secured' : 'would-secure', previouslyHadToken: !!metadata.metadata?.firebaseStorageDownloadTokens, anonymousAccessBlocked: apply ? true : 'not-tested' }));
  } catch {
    errors++;
    // Do not log token-bearing URLs or credentials, including provider errors.
    console.error(JSON.stringify({ bookId: book.id, error: 'Archive migration needs review; original file preserved.' }));
  }
}
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', books: changed, errors }));
if (errors) process.exitCode = 1;
