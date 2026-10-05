import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { watchId } from '@/lib/watch/policy';
import type { AuthenticatedRequestUser } from './auth';
import { WatchError } from './watchErrors';
import { deleteUnfinishedStreamUpload, inspectStreamUpload } from './watchStream';

// Deliberately limited to an orphaned allocation: no attached file, no other
// outstanding reservation for this creator, and exact quota reconciliation.
export async function recoverWatchUpload(actor: AuthenticatedRequestUser, input: unknown) {
  if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.');
  const { id, uid, kind } = z.object({ id: watchId, uid: z.string().regex(/^[a-f0-9]{32}$/), kind: z.enum(['full', 'trailer']) }).strict().parse(input);
  const db = await getAdminDb();
  const record = db.doc(`watchUploadRecoveries/${uid}`);
  const mediaRef = db.doc(`watchPrivate/${id}`);
  const slot = `${kind}Pending`;
  const previous = (await record.get()).data();
  if (previous && (previous.videoId !== id || previous.kind !== kind)) throw new WatchError(409, 'This recovery belongs to another upload.');
  if (previous?.status === 'complete') return { ok: true };
  if (!previous) {
    const provider = await inspectStreamUpload(uid);
    const maximumSeconds = provider.maxDurationSeconds;
    if (provider.readyToStream || provider.status?.state !== 'pendingupload' || (provider.duration || 0) > 0
      || !provider.created || !Number.isFinite(Date.parse(provider.created)) || Date.now() - Date.parse(provider.created) < 120000
      || !Number.isInteger(maximumSeconds) || maximumSeconds! <= 0 || maximumSeconds! > 10800) {
      throw new WatchError(409, 'Only an unused upload reservation older than two minutes can be recovered.');
    }
    await db.runTransaction(async tx => {
      const [existing, video, media] = await tx.getAll(record, db.doc(`watchVideos/${id}`), mediaRef);
      if (existing.exists) {
        if (existing.data()?.videoId !== id || existing.data()?.kind !== kind) throw new WatchError(409, 'This recovery belongs to another upload.');
        return;
      }
      const creatorId = video.data()?.creatorId;
      if (!creatorId || creatorId !== provider.creator || video.data()?.status !== 'draft' || video.data()?.publishedAt
        || media.data()?.[kind] || !media.data()?.[slot]) throw new WatchError(409, 'This is not an orphaned upload for this draft.');
      const creatorRef = db.doc(`watchCreators/${creatorId}`);
      const [creator, videos, fullReferences, trailerReferences] = await Promise.all([
        tx.get(creatorRef), tx.get(db.collection('watchVideos').where('creatorId', '==', creatorId)),
        tx.get(db.collection('watchPrivate').where('full.uid', '==', uid)),
        tx.get(db.collection('watchPrivate').where('trailer.uid', '==', uid)),
      ]);
      if (!fullReferences.empty || !trailerReferences.empty) throw new WatchError(409, 'This upload is attached to a video and cannot be reset.');
      const entries = await tx.getAll(...videos.docs.map(row => db.doc(`watchPrivate/${row.id}`)));
      let knownSeconds = 0; let pendingCount = 0;
      for (const entry of entries) {
        const data = entry.data();
        for (const part of ['full', 'trailer']) {
          knownSeconds += data?.[part]?.maximumSeconds || 0;
          if (data?.[`${part}Pending`]) pendingCount++;
        }
      }
      if (pendingCount !== 1 || creator.data()?.reservedSeconds !== knownSeconds + maximumSeconds!) {
        throw new WatchError(409, 'Upload reservations need manual reconciliation before recovery.');
      }
      tx.create(record, { videoId: id, kind, creatorId, maximumSeconds, status: 'releasing', actorId: actor.uid, createdAt: Date.now() });
    });
  }
  // A failed/lost deletion response leaves the durable recovery record intact.
  // A retry deletes the same allocation, never another file or quota entry.
  await deleteUnfinishedStreamUpload(uid);
  await db.runTransaction(async tx => {
    const recovery = await tx.get(record); const data = recovery.data()!;
    if (data.status === 'complete') return;
    const creatorRef = db.doc(`watchCreators/${data.creatorId}`);
    const [media, creator] = await tx.getAll(mediaRef, creatorRef);
    if (media.data()?.[kind] || !media.data()?.[slot] || (creator.data()?.reservedSeconds || 0) < data.maximumSeconds) {
      throw new WatchError(409, 'The draft changed during recovery; keep its reservation for review.');
    }
    tx.update(mediaRef, { [slot]: false, processingError: '' });
    tx.update(creatorRef, { reservedSeconds: creator.data()!.reservedSeconds - data.maximumSeconds });
    tx.update(record, { status: 'complete', completedAt: Date.now() });
    tx.create(db.collection('watchAudit').doc(), { action: 'admin_recover_upload', actorId: actor.uid, videoId: id, uid, kind, maximumSeconds: data.maximumSeconds, createdAt: Date.now() });
  });
  return { ok: true };
}
