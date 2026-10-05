import { randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminBucket, getAdminDb } from '@/lib/firebase/admin';
import type { AuthenticatedRequestUser } from './auth';
import { WatchError } from './watchErrors';
import { createStreamUpload, StreamUploadRejectedError, streamAssetStatus, streamConfigured, streamHostingStatus, streamPlaybackToken, streamPosterBytes, testStreamUploadAccess, uploadStreamCaptions } from './watchStream';
import { captionSchema, EMPTY_WATCH_STATE, posterMime, publicVideo, uploadSchema, videoAccess, videoDraftSchema, watchId } from '@/lib/watch/policy';
import { getPlayOffer, playLiveConfigured, savePlayProduct, syncPlayPurchase, verifyPlayPlayback } from './watchPlay';
import { getVideoEarnings } from './watchEarnings';
import { getVideoPayoutOverview, payVideoCreator, registerVideoFunding, runVideoPayouts } from './watchPayouts';
import { videoPayoutGateway } from './watchPayoutGateway';
import { removeWatchVideo, requestWatchRevision, reviewWatchRevision, withdrawWatchRevision } from './watchManagement';
import { recoverWatchUpload } from './watchUploadRecovery';
import { relatedVideos } from '@/lib/watch/discovery';
import type { WatchCreator, WatchPrivate, WatchState, WatchVideo } from '@/types/video';

type Actor = AuthenticatedRequestUser;
const admin = (actor: Actor) => { if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.'); };
const author = (actor: Actor) => { if (!['seller', 'both', 'admin'].includes(actor.role)) throw new WatchError(403, 'Open your author workspace to apply as a video creator.'); };
const stateRef = (db: Awaited<ReturnType<typeof getAdminDb>>, uid: string, id: string) => db.doc(`watchStates/${uid}/videos/${id}`);

export async function watchRateLimit(actor: Actor, bucket: string, maximum = 60) {
  const db = await getAdminDb();
  const ref = db.doc(`watchRateLimits/${actor.uid}_${bucket}`);
  await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    const now = Date.now(); const reset = !old || now - old.start >= 60000;
    if (!reset && old.count >= maximum) throw new WatchError(429, 'Please wait a moment before trying again.');
    tx.set(ref, { start: reset ? now : old.start, count: reset ? 1 : old.count + 1 });
  });
}
async function videoRecord(id: string) {
  watchId.parse(id);
  const db = await getAdminDb();
  const snap = await db.doc(`watchVideos/${id}`).get();
  if (!snap.exists) throw new WatchError(404, 'This video is unavailable.');
  return snap.data() as WatchVideo;
}
async function viewerState(actor: Actor, video: WatchVideo): Promise<WatchState> {
  const db = await getAdminDb();
  const [state, entitlement, follow] = await Promise.all([
    stateRef(db, actor.uid, video.id).get(),
    db.doc(`watchEntitlements/${actor.uid}/videos/${video.id}`).get(),
    db.doc(`watchFollows/${actor.uid}/creators/${video.creatorId}`).get(),
  ]);
  return { ...EMPTY_WATCH_STATE, saved: state.data()?.saved === true, seconds: Math.min(video.durationSeconds, Math.max(0, state.data()?.seconds || 0)), owned: entitlement.data()?.status === 'active', following: follow.exists };
}
export async function getWatchCatalog(actor: Actor, cursor: string | null, creator: string | null) {
  if (cursor) watchId.parse(cursor);
  if (creator) watchId.parse(creator);
  const db = await getAdminDb();
  let query = db.collection('watchVideos').where('status', '==', 'published').orderBy(FieldPath.documentId());
  if (creator) query = query.where('creatorId', '==', creator);
  if (cursor) query = query.startAfter(cursor);
  const rows = await query.limit(25).get();
  const page = rows.docs.slice(0, 24);
  let channel: { name: string; uid: string; following: boolean } | null = null;
  if (creator) {
    const [record, following] = await Promise.all([db.doc(`watchCreators/${creator}`).get(), db.doc(`watchFollows/${actor.uid}/creators/${creator}`).get()]);
    if (record.data()?.status === 'approved') channel = { uid: creator, name: record.data()!.name, following: following.exists };
  }
  return { videos: page.map(doc => publicVideo(doc.data() as WatchVideo)), next: rows.size > 24 ? page[page.length - 1].id : null, channel };
}
export async function getWatchDetail(actor: Actor, id: string) {
  const video = await videoRecord(id);
  const state = await viewerState(actor, video);
  if (video.status !== 'published' && !state.owned && video.creatorId !== actor.uid && actor.role !== 'admin') throw new WatchError(404, 'This video is unavailable.');
  return { video: publicVideo(video), state, canPlay: videoAccess(video, actor.uid, actor.role === 'admin', state.owned), hostingReady: streamConfigured(), purchasesReady: playLiveConfigured(), playOffer: await getPlayOffer(actor, id) };
}
export async function getWatchLibrary(actor: Actor) {
  const db = await getAdminDb();
  const [states, purchases] = await Promise.all([
    db.collection(`watchStates/${actor.uid}/videos`).orderBy('updatedAt', 'desc').limit(100).get(),
    db.collection(`watchEntitlements/${actor.uid}/videos`).where('status', '==', 'active').limit(100).get(),
  ]);
  const ids = [...new Set([...states.docs, ...purchases.docs].map(doc => doc.id))];
  if (!ids.length) return { entries: [], limited: false };
  const videos = await db.getAll(...ids.map(id => db.doc(`watchVideos/${id}`)));
  const statesById = new Map(states.docs.map(doc => [doc.id, doc.data()]));
  const purchased = new Set(purchases.docs.map(doc => doc.id));
  return { entries: videos.filter(doc => doc.exists).flatMap(doc => {
    const video = doc.data() as WatchVideo; const state = statesById.get(doc.id);
    if (!purchased.has(doc.id) && video.status !== 'published') return [];
    return [{ video: publicVideo(video), state: { ...EMPTY_WATCH_STATE, owned: purchased.has(doc.id), saved: state?.saved === true, seconds: Math.min(video.durationSeconds, Math.max(0, state?.seconds || 0)) } }];
  }), limited: states.size === 100 || purchases.size === 100 };
}
export async function getWatchRelated(actor: Actor, id: string) {
  const { video } = await getWatchDetail(actor, id);
  const db = await getAdminDb();
  const candidates = await db.collection('watchVideos').where('status', '==', 'published').limit(100).get();
  return { videos: relatedVideos(video, candidates.docs.map(row => publicVideo(row.data() as WatchVideo))) };
}

export async function watchFeedPreview(actor: Actor, id: string) {
  const { video, canPlay } = await getWatchDetail(actor, id);
  if (video.status !== 'published' || !streamConfigured()) return { playback: null };
  // A muted preview is still playback: never issue a paid full-video token to
  // a reader without access. The regular playback function rechecks purchases.
  const trailer = video.hasTrailer;
  if (!trailer && !canPlay) return { playback: null };
  const playback = await watchPlayback(actor, id, trailer);
  return { playback: { ...playback, seconds: 0 }, trailer };
}
export async function getWatchStudio(actor: Actor) {
  author(actor);
  const db = await getAdminDb();
  const [creator, videos] = await Promise.all([db.doc(`watchCreators/${actor.uid}`).get(), db.collection('watchVideos').where('creatorId', '==', actor.uid).limit(100).get()]);
  const records = videos.empty ? [] : await db.getAll(...videos.docs.map(doc => db.doc(`watchPrivate/${doc.id}`)));
  return {
    creator: creator.exists ? creator.data() as WatchCreator : null,
    videos: videos.docs.map((doc, i) => ({ video: publicVideo(doc.data() as WatchVideo), private: records[i].data() as WatchPrivate })),
    hostingReady: streamConfigured(), purchasesReady: playLiveConfigured(), earnings: await getVideoEarnings(actor), payouts: await getVideoPayoutOverview(actor),
  };
}
export async function getWatchAdmin(actor: Actor) {
  admin(actor); const db = await getAdminDb();
  const [creators, videos, reports, notificationStatus] = await Promise.all([
    db.collection('watchCreators').orderBy('createdAt', 'desc').limit(100).get(),
    db.collection('watchVideos').orderBy('updatedAt', 'desc').limit(100).get(),
    db.collection('watchReports').where('status', '==', 'open').limit(100).get(),
    db.doc('watchSystem/playNotifications').get(),
  ]);
  const records = videos.empty ? [] : await db.getAll(...videos.docs.map(doc => db.doc(`watchPrivate/${doc.id}`)));
  return {
    creators: creators.docs.map(doc => doc.data() as WatchCreator),
    videos: videos.docs.map((doc, i) => ({ video: publicVideo(doc.data() as WatchVideo), private: records[i].data() as WatchPrivate })),
    reports: reports.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    lastNotificationTestAt: notificationStatus.data()?.lastTestAt || null,
    hostingReady: streamConfigured(), purchasesReady: playLiveConfigured(), earnings: await getVideoEarnings(actor), payouts: await getVideoPayoutOverview(actor),
  };
}
export async function getWatchHostingStatus(actor: Actor) {
  admin(actor);
  return streamHostingStatus();
}
async function assertEditable(actor: Actor, id: string, automaticCover = false) {
  author(actor);
  const video = await videoRecord(id);
  if (video.creatorId !== actor.uid) throw new WatchError(403, 'This video belongs to another creator.');
  if (video.status !== 'draft' && !(automaticCover && video.status === 'processing')) throw new WatchError(409, 'Only drafts can be edited. Ask an administrator to return this video for changes.');
  const db = await getAdminDb();
  if ((await db.doc(`watchCreators/${actor.uid}`).get()).data()?.status !== 'approved') throw new WatchError(403, 'Creator access is paused or awaiting approval.');
  return video;
}
export async function saveWatchDraft(actor: Actor, input: unknown, existingId?: string) {
  author(actor); const data = videoDraftSchema.parse(input); if (existingId) watchId.parse(existingId);
  const db = await getAdminDb(); const id = existingId || db.collection('watchVideos').doc().id;
  await db.runTransaction(async tx => {
    const [creator, old, secret] = await Promise.all([tx.get(db.doc(`watchCreators/${actor.uid}`)), tx.get(db.doc(`watchVideos/${id}`)), tx.get(db.doc(`watchPrivate/${id}`))]);
    if (creator.data()?.status !== 'approved') throw new WatchError(403, 'Your creator account needs approval before you can add videos.');
    if (old.exists && (old.data()?.creatorId !== actor.uid || old.data()?.status !== 'draft')) throw new WatchError(403, 'Only your own drafts can be edited.');
    // The launch is curated and bounded; uploads have an independent minute quota.
    if (!old.exists && (creator.data()?.draftCount || 0) >= 50) throw new WatchError(409, 'Your catalog allowance is full. Contact support.');
    const { rightsStatement, rightsAccepted: _accepted, ...metadata } = data;
    void _accepted;
    tx.set(db.doc(`watchVideos/${id}`), {
      ...metadata, id, creatorId: actor.uid, creatorName: creator.data()!.name, currency: 'usd',
      status: 'draft', posterUrl: old.data()?.posterUrl || '', durationSeconds: old.data()?.durationSeconds || 0,
      hasTrailer: old.data()?.hasTrailer || false, publishedAt: old.data()?.publishedAt || null, updatedAt: Date.now(),
    });
    tx.set(db.doc(`watchPrivate/${id}`), { rightsStatement, rightsAcceptedAt: Date.now(), reviewNote: secret.data()?.reviewNote || '' }, { merge: true });
    if (!old.exists) tx.update(creator.ref, { draftCount: (creator.data()?.draftCount || 0) + 1 });
  });
  return { id };
}
export async function createWatchUpload(actor: Actor, input: unknown) {
  const data = uploadSchema.parse(input); await assertEditable(actor, data.id);
  if (!streamConfigured()) throw new WatchError(503, 'Hosting is not configured yet. Your draft is saved; uploads will be available after setup.');
  const db = await getAdminDb(); const ref = db.doc(`watchPrivate/${data.id}`);
  const slot = `${data.kind}Pending`;
  const existing = await db.runTransaction(async tx => {
    const [secret, creator, video] = await Promise.all([tx.get(ref), tx.get(db.doc(`watchCreators/${actor.uid}`)), tx.get(db.doc(`watchVideos/${data.id}`))]);
    if (creator.data()?.status !== 'approved' || video.data()?.status !== 'draft' || video.data()?.creatorId !== actor.uid) throw new WatchError(403, 'Uploading is not available for this video.');
    const asset = secret.data()?.[data.kind];
    if (asset) {
      if (!asset.ready && asset.expiresAt > Date.now() && asset.size === data.size && asset.maximumSeconds === data.maximumSeconds) return asset;
      throw new WatchError(409, 'This upload already has a file or has expired. Ask support to replace it safely.');
    }
    if (secret.data()?.[slot]) throw new WatchError(409, 'An upload is already reserved. Ask support to check it before retrying.');
    const used = creator.data()?.reservedSeconds || 0;
    if (used + data.maximumSeconds > (creator.data()?.allowanceSeconds || 0)) throw new WatchError(409, 'This upload exceeds your video minute allowance. Contact support for more capacity.');
    tx.update(creator.ref, { reservedSeconds: used + data.maximumSeconds });
    tx.set(ref, { [slot]: true }, { merge: true }); return null;
  });
  if (existing) return { uploadUrl: existing.uploadUrl };
  // Provider errors deliberately retain the reservation: a timeout can still
  // have created a billable asset. Retrying must never create unlimited assets.
  let asset;
  try { asset = await createStreamUpload(actor.uid, data.size, data.maximumSeconds); }
  catch (error) {
    if (error instanceof StreamUploadRejectedError) {
      await db.runTransaction(async tx => {
        const [media, creator] = await tx.getAll(ref, db.doc(`watchCreators/${actor.uid}`));
        if (!media.data()?.[slot] || media.data()?.[data.kind]) return;
        tx.update(ref, { [slot]: false, processingError: error.message });
        tx.update(creator.ref, { reservedSeconds: Math.max(0, (creator.data()?.reservedSeconds || 0) - data.maximumSeconds) });
      });
    }
    throw error;
  }
  await ref.set({ [data.kind]: asset, [slot]: false, processingError: '' }, { merge: true });
  return { uploadUrl: asset.uploadUrl };
}
export async function refreshWatchAssets(actor: Actor, id: string) {
  const video = await videoRecord(id);
  if (video.creatorId !== actor.uid && actor.role !== 'admin') throw new WatchError(403, 'Access denied.');
  const db = await getAdminDb(); const ref = db.doc(`watchPrivate/${id}`);
  const secret = (await ref.get()).data() as WatchPrivate;
  const patch: Record<string, unknown> = {};
  let duration = video.durationSeconds; let hasTrailer = false;
  for (const kind of ['full', 'trailer'] as const) {
    const asset = secret?.[kind]; if (!asset) continue;
    const status = await streamAssetStatus(asset.uid);
    if (status.duration > asset.maximumSeconds + 1) throw new WatchError(409, 'The uploaded video exceeds its reserved duration.');
    patch[`${kind}.ready`] = status.ready; patch[`${kind}.duration`] = status.duration;
    patch[`${kind}.processingState`] = status.state; patch[`${kind}.processingPercent`] = status.percent; patch[`${kind}.checkedAt`] = Date.now();
    if (kind === 'full') duration = status.duration;
    if (kind === 'trailer') hasTrailer = status.ready;
  }
  if (Object.keys(patch).length) await ref.update(patch);
  await db.doc(`watchVideos/${id}`).update({ durationSeconds: duration, hasTrailer });
  let coverWarning = '';
  if (!video.posterUrl && ['draft', 'processing'].includes(video.status) && video.creatorId === actor.uid && patch['full.ready'] === true && secret.full) {
    try { await setWatchPoster(actor, id, await streamPosterBytes(secret.full.uid, duration), true); }
    catch { coverWarning = 'Your video is ready. An automatic cover could not be created yet; you can retry processing or optionally upload your own cover.'; }
  }
  // A queued submission advances only after every attached asset is ready.
  await db.runTransaction(async tx => {
    const videoRef = db.doc(`watchVideos/${id}`);
    const [current, media, creator, user] = await Promise.all([tx.get(videoRef), tx.get(ref), tx.get(db.doc(`watchCreators/${video.creatorId}`)), tx.get(db.doc(`users/${video.creatorId}`))]);
    const data = media.data();
    if (current.data()?.status !== 'processing' || creator.data()?.status !== 'approved' || !['seller', 'both', 'admin'].includes(user.data()?.role) || ['banned', 'suspended'].includes(user.data()?.status)) return;
    if (data?.full?.ready && (!data.trailer || data.trailer.ready) && !data.fullPending && !data.trailerPending && !data.captionsPending && data.rightsAcceptedAt) {
      tx.update(videoRef, { status: 'in_review', updatedAt: Date.now() });
    }
    tx.update(ref, { processingError: '' });
  });
  return { ready: patch['full.ready'] === true, ...(coverWarning ? { coverWarning } : {}) };
}
export async function setWatchPoster(actor: Actor, id: string, bytes: Buffer, onlyIfMissing = false) {
  await assertEditable(actor, id, onlyIfMissing);
  const contentType = posterMime(bytes);
  if (!contentType || bytes.length > 5 * 1024 * 1024) throw new WatchError(400, 'Choose a PNG, JPEG or WebP image smaller than 5 MB.');
  // Never overwrite artwork already referenced by an approved video if a
  // submission races this upload. Unattached objects can be cleaned up later.
  const bucket = await getAdminBucket(); const path = `watch-posters/${id}/${randomUUID()}`;
  const token = randomUUID();
  await bucket.file(path).save(bytes, { resumable: false, contentType, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  const posterUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  const db = await getAdminDb();
  await db.runTransaction(async tx => {
    const ref = db.doc(`watchVideos/${id}`);
    const [video, creator] = await Promise.all([tx.get(ref), tx.get(db.doc(`watchCreators/${actor.uid}`))]);
    if (video.data()?.creatorId !== actor.uid || (video.data()?.status !== 'draft' && !(onlyIfMissing && video.data()?.status === 'processing')) || creator.data()?.status !== 'approved') throw new WatchError(409, 'This video is no longer editable.');
    // A custom cover selected while the frame was generated always wins.
    if (onlyIfMissing && video.data()?.posterUrl) return;
    tx.update(ref, { posterUrl, updatedAt: Date.now() });
  });
  return { posterUrl };
}
export async function setWatchCaptions(actor: Actor, input: unknown) {
  const data = captionSchema.parse(input); await assertEditable(actor, data.id);
  const db = await getAdminDb(); const ref = db.doc(`watchPrivate/${data.id}`);
  const asset = await db.runTransaction(async tx => {
    const [secret, video, creator] = await Promise.all([tx.get(ref), tx.get(db.doc(`watchVideos/${data.id}`)), tx.get(db.doc(`watchCreators/${actor.uid}`))]);
    if (video.data()?.status !== 'draft' || video.data()?.creatorId !== actor.uid) throw new WatchError(409, 'Only your own drafts can be edited.');
    if (creator.data()?.status !== 'approved') throw new WatchError(403, 'Creator access is paused or awaiting approval.');
    if (secret.data()?.captionsPending) throw new WatchError(409, 'Another subtitle upload is still in progress.');
    const current = secret.data()?.[data.kind];
    if (!current?.ready) throw new WatchError(409, 'Wait for the video to finish processing before adding subtitles.');
    tx.update(ref, { captionsPending: true }); return current;
  });
  // Retain the lock on an ambiguous provider failure. Staff must inspect it;
  // otherwise a delayed write could change a video after rights approval.
  await uploadStreamCaptions(asset.uid, data.language, data.text);
  await ref.update({ [`${data.kind}.captions`]: [...new Set([...(asset.captions || []), data.language])], captionsPending: false });
  return { ok: true };
}
export async function watchPlayback(actor: Actor, id: string, trailer: boolean) {
  if (!trailer) await verifyPlayPlayback(actor.uid, id);
  const { video, state } = await getWatchDetail(actor, id);
  if (!videoAccess(video, actor.uid, actor.role === 'admin', state.owned, trailer)) throw new WatchError(403, video.status === 'removed' ? 'This video is currently unavailable.' : 'Purchase access is required to watch this video.');
  const db = await getAdminDb(); const secret = (await db.doc(`watchPrivate/${id}`).get()).data() as WatchPrivate;
  const asset = trailer ? secret?.trailer : secret?.full;
  if (!asset?.ready) throw new WatchError(409, 'This video is not ready to play yet.');
  return { ...await streamPlaybackToken(asset.uid, asset.duration), seconds: trailer ? 0 : state.seconds, duration: asset.duration };
}
export async function watchAction(actor: Actor, raw: unknown) {
  const envelope = z.object({ action: z.string(), data: z.unknown() }).strict().parse(raw);
  const db = await getAdminDb();
  switch (envelope.action) {
    case 'admin_test_upload': {
      admin(actor); z.object({}).strict().parse(envelope.data);
      return testStreamUploadAccess();
    }
    case 'creator_revision': return requestWatchRevision(actor, envelope.data);
    case 'creator_withdraw_revision': return withdrawWatchRevision(actor, envelope.data);
    case 'creator_remove': return removeWatchVideo(actor, envelope.data);
    case 'admin_revision': return reviewWatchRevision(actor, envelope.data);
    case 'payout_funding': return registerVideoFunding(actor, envelope.data);
    case 'payout_run': {
      admin(actor); z.object({}).strict().parse(envelope.data);
      return runVideoPayouts(db);
    }
    case 'payout_reconcile': {
      admin(actor);
      const { id } = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(envelope.data);
      const payout = (await db.doc(`watchPayouts/${id}`).get()).data();
      if (!payout) throw new WatchError(404, 'Payout not found.');
      return { result: await payVideoCreator(db, payout.budgetId, payout.creatorId, videoPayoutGateway()) };
    }
    case 'play_reconcile': {
      author(actor);
      const { id } = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(envelope.data);
      const purchase = await db.doc(`watchPlayPurchases/${id}`).get();
      if (!purchase.exists || (actor.role !== 'admin' && purchase.data()?.creatorId !== actor.uid)) throw new WatchError(403, 'This sale is unavailable.');
      await syncPlayPurchase(db, purchase.data()!.purchaseToken);
      return { ok: true };
    }
    case 'apply': {
      author(actor);
      const data = z.object({ name: z.string().trim().min(2).max(80) }).strict().parse(envelope.data);
      await db.runTransaction(async tx => {
        const ref = db.doc(`watchCreators/${actor.uid}`); const old = await tx.get(ref);
        if (old.exists) throw new WatchError(409, 'Your creator application has already been received.');
        tx.create(ref, { uid: actor.uid, name: data.name, status: 'pending', allowanceSeconds: 0, reservedSeconds: 0, createdAt: Date.now() });
      }); return { ok: true };
    }
    case 'play_product': return savePlayProduct(actor, envelope.data);
    case 'draft': {
      const data = z.object({ id: watchId.optional(), draft: z.unknown() }).strict().parse(envelope.data);
      return saveWatchDraft(actor, data.draft, data.id);
    }
    case 'upload': return createWatchUpload(actor, envelope.data);
    case 'admin_recover_upload': return recoverWatchUpload(actor, envelope.data);
    case 'captions': return setWatchCaptions(actor, envelope.data);
    case 'refresh': return refreshWatchAssets(actor, z.object({ id: watchId }).strict().parse(envelope.data).id);
    case 'submit': {
      const { id } = z.object({ id: watchId }).strict().parse(envelope.data);
      author(actor);
      await db.runTransaction(async tx => {
        const [video, secret, creator] = await Promise.all([tx.get(db.doc(`watchVideos/${id}`)), tx.get(db.doc(`watchPrivate/${id}`)), tx.get(db.doc(`watchCreators/${actor.uid}`))]);
        if (creator.data()?.status !== 'approved' || video.data()?.creatorId !== actor.uid) throw new WatchError(409, 'This video cannot be submitted.');
        if (['processing', 'in_review'].includes(video.data()?.status)) return;
        if (video.data()?.status !== 'draft') throw new WatchError(409, 'This video cannot be submitted.');
        if (secret.data()?.captionsPending || secret.data()?.fullPending || secret.data()?.trailerPending) throw new WatchError(409, 'Wait for all uploads to finish before submitting.');
        if (!secret.data()?.full || !secret.data()?.rightsAcceptedAt) throw new WatchError(409, 'Add a main video or clip and rights declaration before submitting.');
        tx.update(video.ref, { status: 'processing', updatedAt: Date.now() });
        tx.update(secret.ref, { processingError: '' });
      });
      // Durable intent survives a timeout, tab closure or temporary provider failure.
      try { await refreshWatchAssets(actor, id); } catch { /* The worker retries. */ }
      return { ok: true, status: (await videoRecord(id)).status };
    }
    case 'cancel_submission': {
      const { id } = z.object({ id: watchId }).strict().parse(envelope.data);
      author(actor);
      await db.runTransaction(async tx => {
        const ref = db.doc(`watchVideos/${id}`); const video = await tx.get(ref);
        if (video.data()?.creatorId !== actor.uid || !['processing', 'in_review'].includes(video.data()?.status) || video.data()?.publishedAt) throw new WatchError(409, 'Only your preparing video or unpublished submission can be returned to draft.');
        tx.update(ref, { status: 'draft', updatedAt: Date.now() });
      }); return { ok: true };
    }
    case 'save': {
      const data = z.object({ id: watchId, saved: z.boolean() }).strict().parse(envelope.data);
      const { video } = await getWatchDetail(actor, data.id);
      if (video.status !== 'published') throw new WatchError(409, 'This video is unavailable.');
      await stateRef(db, actor.uid, data.id).set({ saved: data.saved, updatedAt: Date.now() }, { merge: true }); return { ok: true };
    }
    case 'progress': {
      const data = z.object({ id: watchId, seconds: z.number().finite().min(0).max(10800) }).strict().parse(envelope.data);
      const { video, canPlay } = await getWatchDetail(actor, data.id);
      if (!canPlay) throw new WatchError(403, 'Video access is required.');
      await stateRef(db, actor.uid, data.id).set({ seconds: Math.min(video.durationSeconds, data.seconds), updatedAt: Date.now() }, { merge: true }); return { ok: true };
    }
    case 'follow': {
      const data = z.object({ creatorId: watchId, following: z.boolean() }).strict().parse(envelope.data);
      if ((await db.doc(`watchCreators/${data.creatorId}`).get()).data()?.status !== 'approved') throw new WatchError(404, 'This creator is unavailable.');
      const ref = db.doc(`watchFollows/${actor.uid}/creators/${data.creatorId}`);
      if (data.following) await ref.set({ createdAt: Date.now() }); else await ref.delete(); return { ok: true };
    }
    case 'report': {
      const data = z.object({ id: watchId, reason: z.string().trim().min(10).max(2000) }).strict().parse(envelope.data);
      await getWatchDetail(actor, data.id);
      await db.doc(`watchReports/${actor.uid}_${data.id}`).set({ videoId: data.id, reporterId: actor.uid, reason: data.reason, status: 'open', createdAt: Date.now() }); return { ok: true };
    }
    case 'admin_creator': {
      admin(actor);
      const data = z.object({ uid: watchId, status: z.enum(['approved', 'paused']), allowanceSeconds: z.number().int().min(0).max(36000) }).strict().parse(envelope.data);
      const ref = db.doc(`watchCreators/${data.uid}`);
      await db.runTransaction(async tx => {
        const old = await tx.get(ref); if (!old.exists) throw new WatchError(404, 'Creator not found.');
        if (data.allowanceSeconds < (old.data()?.reservedSeconds || 0)) throw new WatchError(400, 'The allowance cannot be lower than reserved video minutes.');
        tx.update(ref, { status: data.status, allowanceSeconds: data.allowanceSeconds });
        tx.create(db.collection('watchAudit').doc(), { actorId: actor.uid, action: envelope.action, ...data, createdAt: Date.now() });
      }); return { ok: true };
    }
    case 'admin_review': {
      admin(actor);
      const data = z.object({ id: watchId, decision: z.enum(['published', 'draft', 'unlisted', 'removed']), note: z.string().trim().max(2000) }).strict().parse(envelope.data);
      if (data.decision !== 'published' && data.note.length < 10) throw new WatchError(400, 'Provide a brief reason for this decision.');
      if (data.decision === 'published') await refreshWatchAssets(actor, data.id);
      await db.runTransaction(async tx => {
        const video = await tx.get(db.doc(`watchVideos/${data.id}`)); if (!video.exists) throw new WatchError(404, 'Video not found.');
        const [secret, creator] = await Promise.all([tx.get(db.doc(`watchPrivate/${data.id}`)), tx.get(db.doc(`watchCreators/${video.data()!.creatorId}`))]);
        if (data.decision === 'published' && (!['in_review', 'unlisted'].includes(video.data()!.status) || secret.data()?.captionsPending || secret.data()?.fullPending || secret.data()?.trailerPending || !secret.data()?.full?.ready || (secret.data()?.trailer && !secret.data()?.trailer.ready) || !secret.data()?.rightsAcceptedAt || creator.data()?.status !== 'approved')) throw new WatchError(409, 'Approve a submitted, processed video from an approved creator.');
        tx.update(video.ref, { status: data.decision, updatedAt: Date.now(), ...(data.decision === 'published' ? { publishedAt: video.data()?.publishedAt || Date.now() } : {}) });
        tx.set(secret.ref, { reviewNote: data.note, ...(['draft', 'removed'].includes(data.decision) && secret.data()?.pendingRevision ? { pendingRevision: null, lastRevisionId: secret.data()!.pendingRevision.id, revisionReviewNote: 'Changes cancelled by the publication review decision.' } : {}) }, { merge: true });
        tx.create(db.collection('watchAudit').doc(), { actorId: actor.uid, action: envelope.action, ...data, createdAt: Date.now() });
      }); return { ok: true };
    }
    case 'admin_resolve': {
      admin(actor); const { id } = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,260}$/) }).strict().parse(envelope.data);
      await db.doc(`watchReports/${id}`).update({ status: 'resolved', resolvedBy: actor.uid, resolvedAt: Date.now() }); return { ok: true };
    }
    default: throw new WatchError(400, 'Unknown video action.');
  }
}
