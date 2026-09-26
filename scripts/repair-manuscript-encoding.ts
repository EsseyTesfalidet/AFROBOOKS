// Dry run: node --env-file=.env.local --import tsx scripts/repair-manuscript-encoding.ts --book BOOK_ID
// Add --apply to repair verified imports. Backups stay in ignored .vercel storage.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { planManuscriptRepair } from '../lib/server/manuscriptRepair';

async function main() {
  const args = process.argv.slice(2);
  const ids: string[] = [];
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--apply') apply = true;
    else if (args[index] === '--book' && /^[A-Za-z0-9_-]+$/.test(args[index + 1] ?? '')) ids.push(args[++index]);
    else throw new Error('Use --book BOOK_ID for each book, with optional --apply.');
  }
  if (!ids.length) throw new Error('At least one explicit --book BOOK_ID is required.');
  const credentials = JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || '{}');
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!projectId || credentials.project_id !== projectId || !bucketName) throw new Error('Project credentials do not match.');
  initializeApp({ credential: cert(credentials), projectId, storageBucket: bucketName });
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const backupDirectory = `.vercel/manuscript-repair/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    for (const id of new Set(ids)) {
      const ref = db.doc(`books/${id}`);
      const archiveRef = db.doc(`privateBooks/${id}`);
      const query = ref.collection('chapters').orderBy('chapterNumber');
      const [book, archive, snapshots] = await Promise.all([ref.get(), archiveRef.get(), query.get()]);
      if (!book.exists || book.data()?.status === 'removed') throw new Error(`Book ${id} is unavailable.`);
      const sourcePath = archive.data()?.manuscriptPath;
      if (typeof sourcePath !== 'string' || !sourcePath.startsWith(`manuscripts/${book.data()?.sellerId}/${id}/`) || sourcePath.includes('..')) {
        throw new Error(`Book ${id} has no matching private manuscript.`);
      }
      const file = bucket.file(sourcePath);
      const [metadata] = await file.getMetadata();
      if (!metadata.generation || Number(metadata.size) > 5 * 1024 * 1024) throw new Error('Unexpected manuscript size or generation.');
      const [bytes] = await bucket.file(sourcePath, { generation: metadata.generation }).download();
      const chapters = snapshots.docs.map(snapshot => {
        const data = snapshot.data();
        return { id: snapshot.id, chapterNumber: data.chapterNumber as number, title: data.title as string, content: data.content as string, wordCount: data.wordCount as number };
      });
      const patches = planManuscriptRepair(bytes, chapters);
      const sourceHash = createHash('sha256').update(bytes).digest('hex');
      if (apply && patches.length) {
        mkdirSync(backupDirectory, { recursive: true });
        writeFileSync(`${backupDirectory}/${id}.json`, JSON.stringify({
          bookId: id, sourcePath, sourceHash, generation: metadata.generation,
          bookWordCount: book.data()?.wordCount, chapters,
        }, null, 2), { flag: 'wx' });
        await db.runTransaction(async tx => {
          const [latestBook, latestArchive, latestChapters] = await Promise.all([tx.get(ref), tx.get(archiveRef), tx.get(query)]);
          if (!latestBook.updateTime?.isEqual(book.updateTime!) || !latestArchive.updateTime?.isEqual(archive.updateTime!) ||
              latestChapters.size !== snapshots.size || latestChapters.docs.some((chapter, index) =>
                chapter.id !== snapshots.docs[index].id || !chapter.updateTime.isEqual(snapshots.docs[index].updateTime))) {
            throw new Error(`Book ${id} changed during repair; run the dry run again.`);
          }
          for (const patch of patches) {
            const { id: chapterId, ...content } = patch;
            tx.update(ref.collection('chapters').doc(chapterId), { ...content, updatedAt: FieldValue.serverTimestamp() });
          }
          const wordCount = chapters.reduce((sum, chapter) => sum + (patches.find(patch => patch.id === chapter.id)?.wordCount ?? chapter.wordCount), 0);
          tx.update(ref, { wordCount, updatedAt: FieldValue.serverTimestamp() });
          tx.set(db.doc(`maintenanceActions/manuscript-encoding-${id}`), {
            action: 'restore-manuscript-encoding', bookId: id, sourceHash, sourceGeneration: metadata.generation,
            chaptersRepaired: patches.length, completedAt: FieldValue.serverTimestamp(),
          });
        });
        const verified = await query.get();
        for (const patch of patches) {
          const actual = verified.docs.find(chapter => chapter.id === patch.id)?.data();
          if (actual?.content !== patch.content || actual?.title !== patch.title || actual?.wordCount !== patch.wordCount) throw new Error(`Book ${id} repair verification failed.`);
        }
      }
      console.log(JSON.stringify({ bookId: id, mode: apply ? 'apply' : 'dry-run', chapters: chapters.length,
        repairedChapters: patches.length, sourceHash, backup: apply && patches.length ? `${backupDirectory}/${id}.json` : null }));
    }
  } finally { await db.terminate(); }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
