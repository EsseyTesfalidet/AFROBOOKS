import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { getAdminBucket, getAdminDb } from '@/lib/firebase/admin';
import { posterMime } from '@/lib/watch/policy';
import { audioRecord } from './audio';
import type { AuthenticatedRequestUser as Actor } from './auth';
import { WatchError } from './watchErrors';

export async function setAudioCover(actor: Actor, id: string, bytes: Buffer | null) {
  const title = await audioRecord(id);
  if (actor.uid !== title.creatorId) throw new WatchError(403, 'This audio belongs to another creator.');
  if (title.status !== 'draft') throw new WatchError(409, 'Withdraw this audio to a draft before changing its cover.');
  const db = await getAdminDb(); const bucket = await getAdminBucket();
  const path = bytes ? `audio-covers/${id}/${randomUUID()}.webp` : '';
  let url = '';
  if (bytes) {
    if (bytes.length > 3_000_000 || !posterMime(bytes)) throw new WatchError(400, 'Choose a JPG, PNG or WebP image smaller than 3 MB.');
    let image: Buffer;
    try { image = await sharp(bytes, { limitInputPixels: 24_000_000, animated: false }).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer(); }
    catch { throw new WatchError(400, 'This image could not be read. Choose a JPG, PNG or WebP image up to 24 megapixels.'); }
    const token = randomUUID();
    await bucket.file(path).save(image, { resumable: false, contentType: 'image/webp', metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata: { firebaseStorageDownloadTokens: token } } });
    url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  }
  let oldPath = '';
  try {
    await db.runTransaction(async tx => {
      const ref = db.doc(`audioTitles/${id}`); const fresh = (await tx.get(ref)).data();
      if (fresh?.creatorId !== actor.uid || fresh?.status !== 'draft') throw new WatchError(409, 'This audio changed. Refresh your studio.');
      oldPath = fresh.coverPath || '';
      tx.update(ref, { coverUrl: url, coverPath: path, updatedAt: Date.now() });
    });
  } catch (error) { if (path) await bucket.file(path).delete({ ignoreNotFound: true }).catch(() => undefined); throw error; }
  if (oldPath.startsWith(`audio-covers/${id}/`)) await bucket.file(oldPath).delete({ ignoreNotFound: true }).catch(() => undefined);
  return { coverUrl: url };
}
