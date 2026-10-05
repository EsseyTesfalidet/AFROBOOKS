import { randomUUID } from 'node:crypto';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { getAdminBucket, getAdminDb } from '@/lib/firebase/admin';
import { posterMime, watchId } from '@/lib/watch/policy';
import { streamPosterBytes } from './watchStream';

const eligible = (status: unknown) => ['draft', 'processing', 'in_review', 'published', 'unlisted'].includes(String(status));

// Server-owned frame extraction. Only the image is public; the signed video
// token stays on the server. A lease bounds work across viewers and job runs.
export async function ensureWatchPoster(id: string, now = Date.now()): Promise<string> {
  watchId.parse(id);
  const db = await getAdminDb();
  const videoRef = db.doc(`watchVideos/${id}`), mediaRef = db.doc(`watchPrivate/${id}`);
  const owner = randomUUID();
  const candidate = await db.runTransaction(async tx => {
    const [video, media] = await tx.getAll(videoRef, mediaRef);
    const data = video.data(), secret = media.data();
    if (!data || !eligible(data.status) || secret?.creatorRemovedAt) return { posterUrl: '' };
    if (data.posterUrl) return { posterUrl: String(data.posterUrl) };
    if (!secret?.full?.ready || (secret.automaticCover?.leaseUntil || 0) > now || (secret.automaticCover?.retryAfter || 0) > now) return { posterUrl: '' };
    const creator = await tx.get(db.doc(`watchCreators/${data.creatorId}`));
    if (creator.data()?.status !== 'approved') return { posterUrl: '' };
    tx.update(mediaRef, { automaticCover: { owner, leaseUntil: now + 120_000, retryAfter: 0 } });
    return { uid: String(secret.full.uid), duration: Number(secret.full.duration || data.durationSeconds) };
  });
  if ('posterUrl' in candidate) return candidate.posterUrl || '';
  let saved: ReturnType<Awaited<ReturnType<typeof getAdminBucket>>['file']> | undefined;
  let attached = false;
  try {
    const bytes = await streamPosterBytes(candidate.uid, candidate.duration);
    const contentType = posterMime(bytes);
    if (!contentType) throw new Error('Invalid video frame');
    const bucket = await getAdminBucket(), token = randomUUID();
    const path = `watch-posters/${id}/${randomUUID()}`;
    saved = bucket.file(path);
    await saved.save(bytes, { resumable: false, contentType, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
    const posterUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    const result = await db.runTransaction(async tx => {
      const [video, media] = await tx.getAll(videoRef, mediaRef);
      const data = video.data(), secret = media.data();
      if (!data || !eligible(data.status) || secret?.creatorRemovedAt) return '';
      // A custom cover, replacement file or moderation decision wins a race.
      if (data.posterUrl) return String(data.posterUrl);
      if (secret?.automaticCover?.owner !== owner || secret.full?.uid !== candidate.uid || !secret.full.ready) return '';
      tx.update(videoRef, { posterUrl });
      return posterUrl;
    });
    attached = result === posterUrl;
    return result;
  } catch {
    // A slow thumbnail must not prevent submission or playback. Readers and
    // the scheduled repair will retry, including after a video is published.
    return '';
  } finally {
    if (saved && !attached) await saved.delete({ ignoreNotFound: true }).catch(() => {});
    await db.runTransaction(async tx => {
      const media = await tx.get(mediaRef);
      if (media.data()?.automaticCover?.owner === owner) tx.update(mediaRef, { automaticCover: { owner: null, leaseUntil: 0, retryAfter: attached ? 0 : Date.now() + 60_000 } });
    });
  }
}

// Missing posters can outlive processing, so repair them independently of the
// submission queue. Rotate through a bounded batch so an unready draft cannot
// starve published videos of their artwork.
export async function repairWatchPosters(db: Firestore, now = Date.now()) {
  const ref = db.doc('watchSystem/artwork'), owner = randomUUID();
  const cursor = await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    if ((old?.leaseUntil || 0) > now) return null;
    tx.set(ref, { owner, leaseUntil: now + 10 * 60_000 }, { merge: true });
    return typeof old?.cursor === 'string' ? old.cursor : '';
  });
  if (cursor === null) return { busy: true, checked: 0, repaired: 0 };
  try {
    let query = db.collection('watchVideos').where('posterUrl', '==', '').orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(cursor);
    const rows = await query.limit(3).get();
    const results = await Promise.all(rows.docs.map(row => ensureWatchPoster(row.id, now)));
    const repaired = results.filter(Boolean).length;
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.owner === owner) tx.set(ref, { cursor: rows.size === 3 ? rows.docs[2].id : '', checked: rows.size, repaired, lastRunAt: now, owner: null, leaseUntil: 0 }, { merge: true });
    });
    return { busy: false, checked: rows.size, repaired };
  } finally {
    await db.runTransaction(async tx => { if ((await tx.get(ref)).data()?.owner === owner) tx.update(ref, { owner: null, leaseUntil: 0 }); });
  }
}
