import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { videoDraftSchema, watchId } from '@/lib/watch/policy';
import type { AuthenticatedRequestUser } from './auth';
import { WatchError } from './watchErrors';

const creatorRole = (actor: AuthenticatedRequestUser) => {
  if (!['seller', 'both', 'admin'].includes(actor.role)) throw new WatchError(403, 'Creator access required.');
};

export async function requestWatchRevision(actor: AuthenticatedRequestUser, input: unknown) {
  creatorRole(actor);
  const data = z.object({ id: watchId, revisionId: watchId, draft: videoDraftSchema }).strict().parse(input);
  const db = await getAdminDb();
  await db.runTransaction(async tx => {
    const [video, media, creator] = await tx.getAll(db.doc(`watchVideos/${data.id}`), db.doc(`watchPrivate/${data.id}`), db.doc(`watchCreators/${actor.uid}`));
    if (video.data()?.creatorId !== actor.uid) throw new WatchError(403, 'You can only edit your own videos.');
    if (creator.data()?.status !== 'approved') throw new WatchError(403, 'Creator access is paused or awaiting approval.');
    if (!['published', 'unlisted'].includes(video.data()?.status)) throw new WatchError(409, 'Only published or unlisted videos use change review.');
    const pending = media.data()?.pendingRevision;
    if (pending?.id === data.revisionId) {
      if (!Object.entries(data.draft).every(([key, value]) => pending.draft?.[key] === value)) throw new WatchError(409, 'This request has already been submitted. Refresh before changing it.');
      return;
    }
    if (media.data()?.lastRevisionId === data.revisionId) return;
    if (pending) throw new WatchError(409, 'Your previous changes are awaiting review. Withdraw them before submitting new changes.');
    tx.update(media.ref, { pendingRevision: { id: data.revisionId, draft: data.draft, requestedAt: Date.now() }, revisionReviewNote: '' });
    tx.update(video.ref, { updatedAt: Date.now() });
    tx.create(db.collection('watchAudit').doc(), { actorId: actor.uid, action: 'creator_revision', videoId: data.id, revisionId: data.revisionId, createdAt: Date.now() });
  });
  return { ok: true };
}

export async function withdrawWatchRevision(actor: AuthenticatedRequestUser, input: unknown) {
  creatorRole(actor);
  const data = z.object({ id: watchId, revisionId: watchId }).strict().parse(input);
  const db = await getAdminDb();
  await db.runTransaction(async tx => {
    const [video, media] = await tx.getAll(db.doc(`watchVideos/${data.id}`), db.doc(`watchPrivate/${data.id}`));
    if (video.data()?.creatorId !== actor.uid) throw new WatchError(403, 'You can only edit your own videos.');
    if (media.data()?.pendingRevision?.id !== data.revisionId) throw new WatchError(409, 'These changes have already been reviewed or withdrawn. Refresh this page.');
    tx.update(media.ref, { pendingRevision: null, lastRevisionId: data.revisionId, revisionReviewNote: 'Changes withdrawn by the creator.' });
    tx.create(db.collection('watchAudit').doc(), { actorId: actor.uid, action: 'creator_withdraw_revision', videoId: data.id, revisionId: data.revisionId, createdAt: Date.now() });
  });
  return { ok: true };
}

export async function reviewWatchRevision(actor: AuthenticatedRequestUser, input: unknown) {
  if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.');
  const data = z.object({ id: watchId, revisionId: watchId, decision: z.enum(['approve', 'reject']), note: z.string().trim().max(2000) }).strict().parse(input);
  if (data.decision === 'reject' && data.note.length < 10) throw new WatchError(400, 'Explain the correction needed before rejecting changes.');
  const db = await getAdminDb();
  let priceChanged = false;
  await db.runTransaction(async tx => {
    const [video, media] = await tx.getAll(db.doc(`watchVideos/${data.id}`), db.doc(`watchPrivate/${data.id}`));
    const pending = media.data()?.pendingRevision;
    if (!video.exists || !pending || pending.id !== data.revisionId) throw new WatchError(409, 'These changes have already been reviewed or withdrawn. Refresh this page.');
    if (data.decision === 'approve') {
      const [creator, user] = await tx.getAll(db.doc(`watchCreators/${video.data()!.creatorId}`), db.doc(`users/${video.data()!.creatorId}`));
      if (!['published', 'unlisted'].includes(video.data()!.status) || creator.data()?.status !== 'approved' || !['seller', 'both', 'admin'].includes(user.data()?.role) || ['suspended', 'banned'].includes(user.data()?.status)) throw new WatchError(409, 'This video or creator is no longer eligible for changes.');
      const { rightsStatement, rightsAccepted: _accepted, ...metadata } = videoDraftSchema.parse(pending.draft);
      void _accepted;
      priceChanged = metadata.priceCents !== video.data()!.priceCents;
      const productId = media.data()?.playProductId;
      const product = priceChanged && productId ? await tx.get(db.doc(`watchPlayProducts/${productId}`)) : null;
      // Store checkout prices are managed separately. Pause new sales until an
      // admin aligns the Play price and re-enables the existing product mapping.
      if (priceChanged && product?.exists && product.data()?.videoId === data.id) tx.update(product.ref, { enabled: false, liveEnabled: false, updatedAt: Date.now() });
      tx.update(video.ref, { ...metadata, updatedAt: Date.now() });
      tx.update(media.ref, { rightsStatement, rightsAcceptedAt: pending.requestedAt, ...(priceChanged ? { playTestEnabled: false, playLiveEnabled: false } : {}) });
    }
    tx.update(media.ref, { pendingRevision: null, lastRevisionId: data.revisionId, revisionReviewNote: data.note || 'Changes approved.' });
    tx.create(db.collection('watchAudit').doc(), { actorId: actor.uid, action: 'admin_revision', videoId: data.id, revisionId: data.revisionId, decision: data.decision, note: data.note, createdAt: Date.now() });
  });
  return { ok: true, priceChanged };
}

export async function removeWatchVideo(actor: AuthenticatedRequestUser, input: unknown) {
  creatorRole(actor);
  const { id } = z.object({ id: watchId }).strict().parse(input);
  const db = await getAdminDb();
  let status = 'removed';
  await db.runTransaction(async tx => {
    const [video, media] = await tx.getAll(db.doc(`watchVideos/${id}`), db.doc(`watchPrivate/${id}`));
    if (video.data()?.creatorId !== actor.uid) throw new WatchError(403, 'You can only remove your own videos.');
    // Never weaken an administrator's block or erase a purchased asset.
    if (video.data()?.status === 'removed') { status = 'removed'; return; }
    const wasPublished = !!video.data()?.publishedAt || ['published', 'unlisted'].includes(video.data()?.status);
    status = wasPublished ? 'unlisted' : 'removed';
    if (video.data()?.status === status && media.data()?.creatorRemovedAt) return;
    tx.update(video.ref, { status, updatedAt: Date.now() });
    tx.update(media.ref, { creatorRemovedAt: Date.now(), pendingRevision: null, ...(media.data()?.pendingRevision ? { lastRevisionId: media.data()!.pendingRevision.id, revisionReviewNote: 'Changes withdrawn when the video was removed from Screen.' } : {}) });
    tx.create(db.collection('watchAudit').doc(), { actorId: actor.uid, action: 'creator_remove', videoId: id, status, createdAt: Date.now() });
  });
  return { ok: true, status };
}
