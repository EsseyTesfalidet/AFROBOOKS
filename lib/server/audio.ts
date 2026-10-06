import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminBucket, getAdminDb } from '@/lib/firebase/admin';
import { AUDIO_MAX_BYTES, audioDraft, audioId, mp3Signature } from '@/lib/audio/policy';
import type { AudioTitle, AudioEntry } from '@/types/audio';
import type { AuthenticatedRequestUser as Actor } from './auth';
import { WatchError } from './watchErrors';
import { getPlayOffer, savePlayProduct, verifyPlayPlayback } from './watchPlay';
import { getVideoEarnings } from './watchEarnings';
import { getVideoPayoutOverview } from './watchPayouts';
import { musicAccess, musicSession, musicStatus, recordMusicListening } from './musicSubscriptions';

function author(actor: Actor) { if (!['seller', 'both', 'admin'].includes(actor.role)) throw new WatchError(403, 'Open your author space to become a creator first.'); }
function admin(actor: Actor) { if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.'); }
const publicTitle = (value: AudioTitle): AudioTitle => ({ id: value.id, creatorId: value.creatorId, creatorName: value.creatorName, title: value.title, description: value.description, category: value.category, language: value.language, status: value.status, priceCents: value.priceCents, musicSubscription: value.musicSubscription === true, durationSeconds: value.durationSeconds, ready: value.ready, updatedAt: value.updatedAt, reviewNote: value.reviewNote || '' });
const assetPath = (value: AudioTitle) => `audio/${value.creatorId}/${value.id}/playback.mp3`;
const uploadPath = (value: AudioTitle) => `audio/${value.creatorId}/${value.id}/source.mp3`;
export async function audioRecord(id: string, allowRemoved = false) {
  audioId.parse(id); const db = await getAdminDb(); const record = await db.doc(`audioTitles/${id}`).get();
  if (!record.exists || (!allowRemoved && record.data()?.status === 'removed')) throw new WatchError(404, 'This audio is unavailable.');
  return record.data() as AudioTitle;
}
async function canListen(actor: Actor, value: AudioTitle) {
  const owned = value.status !== 'published' && value.creatorId !== actor.uid && actor.role !== 'admin' ? (await (await getAdminDb()).doc(`audioEntitlements/${actor.uid}/titles/${value.id}`).get()).data()?.status === 'active' : false;
  if (!value.ready || (value.status !== 'published' && value.creatorId !== actor.uid && actor.role !== 'admin' && !owned)) throw new WatchError(404, 'This audio is unavailable.');
}
export async function audioList(actor: Actor, view: string, after: string | null): Promise<{ entries: AudioEntry[]; next: string | null; limited?: boolean }> {
  const db = await getAdminDb();
  if (view === 'library') {
    const [states, purchases] = await Promise.all([db.collection(`audioStates/${actor.uid}/titles`).orderBy('updatedAt', 'desc').limit(100).get(), db.collection(`audioEntitlements/${actor.uid}/titles`).where('status', '==', 'active').limit(100).get()]);
    const ids = [...new Set([...states.docs, ...purchases.docs].map(row => row.id))];
    if (!ids.length) return { entries: [], next: null };
    const records = await db.getAll(...ids.map(id => db.doc(`audioTitles/${id}`))); const stateMap = new Map(states.docs.map(row => [row.id, row.data()])); const owned = new Set(purchases.docs.map(row => row.id));
    return { entries: records.flatMap(row => { const title = row.data() as AudioTitle | undefined; const state = stateMap.get(row.id); return title && title.status !== 'removed' && (title.status === 'published' || owned.has(row.id)) && (owned.has(row.id) || state?.saved || state?.seconds > 0) ? [{ title: publicTitle(title), saved: state?.saved === true, seconds: state?.seconds || 0, owned: owned.has(row.id) }] : []; }), next: null, limited: states.size === 100 || purchases.size === 100 };
  }
  if (!['catalog', 'studio', 'admin'].includes(view)) throw new WatchError(400, 'Unknown audio view.');
  if (view === 'studio') author(actor); if (view === 'admin') admin(actor);
  let query = db.collection('audioTitles').orderBy(FieldPath.documentId());
  if (view === 'catalog') query = query.where('status', '==', 'published');
  if (view === 'studio') query = query.where('creatorId', '==', actor.uid);
  if (after) query = query.startAfter(audioId.parse(after));
  const rows = await query.limit(41).get(); const page = rows.docs.slice(0, 40);
  return { entries: page.filter(row => row.data().status !== 'removed').map(row => ({ title: publicTitle(row.data() as AudioTitle), saved: false, seconds: 0 })), next: rows.size > 40 ? page[39].id : null };
}
export async function audioPlayback(actor: Actor, id: string) {
  const title = await audioRecord(id); await canListen(actor, title);
  await audioAccess(actor, title, true);
  const db = await getAdminDb(); const state = await db.doc(`audioStates/${actor.uid}/titles/${id}`).get();
  const bucket = await getAdminBucket(); const expiresAt = Date.now() + (title.musicSubscription ? 15 * 60 : 4 * 60 * 60) * 1000;
  const [url] = await bucket.file(assetPath(title)).getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt });
  const seconds = state.data()?.seconds || 0;
  return { title: publicTitle(title), url, expiresAt, seconds, sessionId: title.musicSubscription ? await musicSession(actor, title.id, title.creatorId, seconds) : null };
}
async function audioAccess(actor: Actor, title: AudioTitle, verify = false) {
  if (title.creatorId === actor.uid || actor.role === 'admin') return;
  if (title.musicSubscription) {
    if (verify) await musicAccess(actor);
    else if (!(await musicStatus(actor)).active) throw new WatchError(403, 'Subscribe to Music to listen to this title.');
    return;
  }
  if (!title.priceCents) return;
  if (verify) await verifyPlayPlayback(actor.uid, title.id, 'audio');
  const db = await getAdminDb(); const owned = await db.doc(`audioEntitlements/${actor.uid}/titles/${title.id}`).get();
  if (owned.data()?.status !== 'active') throw new WatchError(403, 'Purchase this audio to listen.');
}
export async function audioDetail(actor: Actor, id: string) {
  const title = await audioRecord(id); await canListen(actor, title);
  let canPlay = true; try { await audioAccess(actor, title); } catch { canPlay = false; }
  return { title: publicTitle(title), canPlay, offer: canPlay ? null : await getPlayOffer(actor, id, 'audio') };
}
export async function audioFinances(actor: Actor) {
  author(actor); return { earnings: await getVideoEarnings(actor), payouts: await getVideoPayoutOverview(actor) };
}
export async function audioAction(actor: Actor, input: unknown) {
  const { action, data } = z.object({ action: z.string(), data: z.record(z.unknown()) }).parse(input);
  const db = await getAdminDb();
  if (action === 'product') { admin(actor); return savePlayProduct(actor, { videoId: data.id, productId: data.productId, enabled: data.enabled, liveEnabled: data.liveEnabled, contentKind: 'audio' }); }
  if (action === 'create') {
    author(actor); const draft = audioDraft.parse(data); const id = randomUUID();
    const profile = (await db.doc(`users/${actor.uid}`).get()).data();
    const creatorName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').slice(0, 120) || 'AfroBooks creator';
    await db.runTransaction(async tx => {
      const quota = db.doc(`audioQuotas/${actor.uid}`); const current = (await tx.get(quota)).data()?.count || 0;
      if (current >= 20) throw new WatchError(409, 'Your studio allows 20 audio uploads. Remove an unused draft before adding another.');
      tx.set(db.doc(`audioTitles/${id}`), { ...draft, id, creatorId: actor.uid, creatorName, status: 'draft', ready: false, durationSeconds: 0, updatedAt: Date.now(), reviewNote: '', rightsAcceptedAt: Date.now() });
      tx.set(quota, { count: current + 1 });
    });
    return { id, path: `audio/${actor.uid}/${id}/source.mp3` };
  }
  const id = audioId.parse(data.id); const value = await audioRecord(id, action === 'remove');
  if (['save', 'progress'].includes(action)) {
    await canListen(actor, value);
    if (action === 'progress') { await audioAccess(actor, value); if (value.musicSubscription) await recordMusicListening(actor, id, data.sessionId, Math.min(value.durationSeconds, z.number().finite().min(0).max(172800).parse(data.seconds))); }
    const update = action === 'save' ? { saved: z.boolean().parse(data.saved) } : { seconds: Math.min(value.durationSeconds, z.number().finite().min(0).max(172800).parse(data.seconds)) };
    await db.doc(`audioStates/${actor.uid}/titles/${id}`).set({ ...update, updatedAt: Date.now() }, { merge: true }); return { ok: true };
  }
  if (action === 'review' || action === 'hide') admin(actor);
  else { author(actor); if (value.creatorId !== actor.uid) throw new WatchError(403, 'This audio belongs to another creator.'); }
  if (action === 'finish') {
    if (value.status !== 'draft') throw new WatchError(409, 'This audio has already been submitted.');
    if (value.ready) return { ok: true };
    const duration = z.number().finite().positive().max(172800).parse(data.durationSeconds);
    const bucket = await getAdminBucket(); const source = bucket.file(uploadPath(value)); const destination = bucket.file(assetPath(value));
    const [sourceExists] = await source.exists(); const file = sourceExists ? source : destination;
    const [exists] = await file.exists(); if (!exists) throw new WatchError(409, 'Upload the MP3 first.');
    const [meta] = await file.getMetadata();
    if (Number(meta.size) > AUDIO_MAX_BYTES || Number(meta.size) < 128 || meta.contentType !== 'audio/mpeg') throw new WatchError(400, 'Choose a valid MP3 up to 250 MB.');
    const [header] = await file.download({ start: 0, end: 15 });
    if (!mp3Signature(header)) throw new WatchError(400, 'The file does not look like an MP3. Export it as MP3 and try again.');
    // Publish a separate, immutable server-only object. Never inherit the
    // Firebase client's download token into paid playback, even during retries.
    if (sourceExists) {
      try { await source.copy(destination, { preconditionOpts: { ifGenerationMatch: 0 }, contentType: 'audio/mpeg', cacheControl: 'private, no-store', metadata: { firebaseStorageDownloadTokens: null, afrobooksPrivate: 'true' } }); }
      catch (error) { if ((error as { code?: number }).code !== 412) throw error; }
      await source.delete({ ignoreNotFound: true });
    }
    await db.runTransaction(async tx => {
      const ref = db.doc(`audioTitles/${id}`); const fresh = (await tx.get(ref)).data();
      if (fresh?.status !== 'draft') throw new WatchError(409, 'Refresh the studio before continuing.');
      tx.update(ref, { ready: true, durationSeconds: duration, updatedAt: Date.now() });
    }); return { ok: true };
  }
  if (action === 'remove') {
    const purchases = await db.collection('watchPlayPurchases').where('videoId', '==', id).limit(1).get();
    if (!purchases.empty) throw new WatchError(409, 'This title has purchases. Withdraw it instead; existing buyers keep their audio.');
    // Product mappings are permanent; preserve files for late Google confirmations.
    await db.runTransaction(async tx => {
      const ref = db.doc(`audioTitles/${id}`); const [fresh, product] = await Promise.all([tx.get(ref), tx.get(db.doc(`audioPrivate/${id}`))]);
      if (product.data()?.playProductId) throw new WatchError(409, 'This title has checkout configured. Withdraw it instead so buyers keep their audio.');
      if (!fresh.exists) throw new WatchError(404, 'This audio is unavailable.');
      tx.update(ref, { status: 'removed', updatedAt: Date.now() });
    });
    const bucket = await getAdminBucket();
    await Promise.all([bucket.file(assetPath(value)).delete({ ignoreNotFound: true }), bucket.file(uploadPath(value)).delete({ ignoreNotFound: true })]);
    await db.runTransaction(async tx => {
      const quota = db.doc(`audioQuotas/${actor.uid}`); const ref = db.doc(`audioTitles/${id}`);
      const [q, old] = await Promise.all([tx.get(quota), tx.get(ref)]);
      if (!old.data()?.quotaReleased) { tx.set(quota, { count: Math.max(0, (q.data()?.count || 1) - 1) }); tx.update(ref, { quotaReleased: true }); }
    }); return { ok: true };
  }
  await db.runTransaction(async tx => {
    const ref = db.doc(`audioTitles/${id}`); const fresh = (await tx.get(ref)).data() as AudioTitle | undefined;
    if (!fresh || fresh.status === 'removed') throw new WatchError(404, 'This audio is unavailable.');
    if (action === 'edit') {
      if (fresh.status !== 'draft') throw new WatchError(409, 'Withdraw this audio to a draft before editing.');
      const draft = audioDraft.parse(data);
      tx.update(ref, { ...draft, updatedAt: Date.now() });
      if (draft.priceCents !== fresh.priceCents) tx.set(db.doc(`audioPrivate/${id}`), { playTestEnabled: false, playLiveEnabled: false }, { merge: true });
    } else if (action === 'submit') {
      if (fresh.status !== 'draft' || !fresh.ready) throw new WatchError(409, 'Finish uploading your audio before submitting.');
      tx.update(ref, { status: 'in_review', reviewNote: '', updatedAt: Date.now() });
    } else if (action === 'withdraw' || action === 'hide') {
      tx.update(ref, { status: 'draft', updatedAt: Date.now() });
    } else if (action === 'review') {
      if (fresh.status !== 'in_review') throw new WatchError(409, 'Only submitted audio can be reviewed.');
      const publish = z.boolean().parse(data.publish); const note = z.string().trim().max(1000).parse(data.note || '');
      if (publish && !fresh.ready) throw new WatchError(409, 'Audio must be ready before publishing.');
      if (!publish && !note) throw new WatchError(400, 'Tell the creator what needs changing.');
      const creatorRef = db.doc(`watchCreators/${fresh.creatorId}`); const creator = await tx.get(creatorRef);
      if (publish && creator.data()?.status === 'paused') throw new WatchError(409, 'This creator is paused. Review their creator account before publishing.');
      if (publish && !creator.exists) tx.set(creatorRef, { uid: fresh.creatorId, name: fresh.creatorName, status: 'approved', allowanceSeconds: 0, reservedSeconds: 0, createdAt: Date.now() });
      tx.update(ref, { status: publish ? 'published' : 'draft', reviewNote: note, updatedAt: Date.now() });
      tx.set(db.collection('audioAudit').doc(), { id, actorId: actor.uid, publish, note, at: Date.now() });
    } else throw new WatchError(400, 'Unknown audio action.');
  });
  return { ok: true };
}
