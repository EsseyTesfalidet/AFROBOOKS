import { getAdminBucket, getAdminDb } from '@/lib/firebase/admin';
import { audioId } from '@/lib/audio/policy';
import { publicAudioSamplePath } from '@/lib/seo/publicSamples';

export async function getPublicAudioSampleUrl(id: string) {
  audioId.parse(id);
  const db = await getAdminDb();
  const record = await db.doc(`audioTitles/${id}`).get();
  const path = record.exists ? publicAudioSamplePath({ ...record.data(), id: record.id }) : null;
  if (!path) return null;
  // Every request checks current publication status. Only the existing sample
  // is signed; no purchase, royalty session, or new sample is generated.
  const [url] = await (await getAdminBucket()).file(path).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 15 * 60_000 });
  return url;
}
