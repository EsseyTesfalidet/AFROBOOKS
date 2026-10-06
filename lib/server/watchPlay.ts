import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { PLAY_PACKAGE, PLAY_PRODUCT_PATTERN, VIDEO_PLATFORM_BPS, type PlayOffer, type PlayPurchaseResult } from '@/lib/watch/play';
import { watchId } from '@/lib/watch/policy';
import type { AuthenticatedRequestUser } from './auth';
import { googlePlay, playConfigured, type PlayClient, type PlayPurchase } from './watchPlayClient';
import { WatchError } from './watchErrors';
import { playOrderEarnings } from './watchEarnings';

export const playToken = z.string().min(10).max(4096).regex(/^[A-Za-z0-9._~+\/-]+$/);
export const playProductId = z.string().regex(PLAY_PRODUCT_PATTERN);
export const playAccountId = (uid: string) => createHash('sha256').update(`afrobooks:google-play:${uid}`).digest('hex');
export const playPurchaseId = (token: string) => createHash('sha256').update(token).digest('hex');
export function playTester(uid: string) { return (process.env.WATCH_PLAY_TEST_UIDS || '').split(',').map(s => s.trim()).filter(Boolean).includes(uid); }
export function playLiveConfigured() { return playConfigured() && process.env.WATCH_PLAY_LIVE_ENABLED === 'true' && !!process.env.GOOGLE_PLAY_RTDN_AUDIENCE && !!process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL; }
const checkoutPath = (account: string, product: string) => `watchPlayCheckouts/${account}_${product}`;
type ContentKind = 'video' | 'audio';
const contentPaths = (kind: ContentKind = 'video') => kind === 'audio'
  ? { titles: 'audioTitles', private: 'audioPrivate', entitlements: 'audioEntitlements', states: 'audioStates', items: 'titles' }
  : { titles: 'watchVideos', private: 'watchPrivate', entitlements: 'watchEntitlements', states: 'watchStates', items: 'videos' };

export async function savePlayProduct(actor: AuthenticatedRequestUser, input: unknown, client: PlayClient = googlePlay) {
  if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.');
  const data = z.object({ videoId: watchId, productId: playProductId, enabled: z.boolean(), liveEnabled: z.boolean().default(false), contentKind: z.enum(['video', 'audio']).default('video') }).strict().parse(input);
  const paths = contentPaths(data.contentKind);
  if (!data.productId.startsWith(`afrobooks_${data.contentKind}_`)) throw new WatchError(400, 'The product prefix must match the content type.');
  const db = await getAdminDb();
  if (data.liveEnabled) {
    if (!playLiveConfigured() || !client.product) throw new WatchError(409, 'Complete Google Play verification and purchase notifications before enabling sales.');
    if (!(await db.doc('watchSystem/playNotifications').get()).data()?.lastTestAt) throw new WatchError(409, 'Save the notification topic in Play Console and send a successful test notification before enabling sales.');
    const product = await client.product(data.productId);
    const options = product.purchaseOptions;
    if (product.packageName !== PLAY_PACKAGE || product.productId !== data.productId || options?.length !== 1 || options[0].state !== 'ACTIVE' || !options[0].buyOption || options[0].rentOption || options[0].buyOption.multiQuantityEnabled) throw new WatchError(409, 'Activate one standard, single-quantity buy option for this product in Play Console.');
  }
  await db.runTransaction(async tx => {
    const videoRef = db.doc(`${paths.titles}/${data.videoId}`);
    const productRef = db.doc(`watchPlayProducts/${data.productId}`);
    const privateRef = db.doc(`${paths.private}/${data.videoId}`);
    const [video, product, privateData] = await Promise.all([tx.get(videoRef), tx.get(productRef), tx.get(privateRef)]);
    if (!video.exists || video.data()?.priceCents <= 0) throw new WatchError(409, 'Choose a paid video first.');
    if (data.contentKind === 'audio' && video.data()?.status === 'removed') throw new WatchError(409, 'This audio has been removed.');
    if ((product.exists && (product.data()?.videoId !== data.videoId || (product.data()?.contentKind || 'video') !== data.contentKind || product.data()?.creatorId !== video.data()?.creatorId)) || (privateData.data()?.playProductId && privateData.data()?.playProductId !== data.productId)) throw new WatchError(409, 'A Play product cannot be reassigned to another title.');
    if (data.liveEnabled) {
      const creator = await tx.get(db.doc(`watchCreators/${video.data()!.creatorId}`));
      if (video.data()?.status !== 'published' || !(data.contentKind === 'audio' ? video.data()?.ready : privateData.data()?.full?.ready) || creator.data()?.status !== 'approved') throw new WatchError(409, 'Publish ready content from an approved creator before enabling checkout.');
    }
    tx.set(productRef, { ...data, creatorId: video.data()!.creatorId, updatedAt: Date.now() });
    tx.set(privateRef, { playProductId: data.productId, playTestEnabled: data.enabled, playLiveEnabled: data.liveEnabled }, { merge: true });
    tx.create(db.collection('watchAudit').doc(), { actorId: actor.uid, action: 'play_product', ...data, createdAt: Date.now() });
  });
  return { ok: true };
}
export async function getPlayOffer(actor: AuthenticatedRequestUser, videoId: string, kind: ContentKind = 'video'): Promise<PlayOffer | null> {
  if (!playConfigured() || (!playTester(actor.uid) && !playLiveConfigured())) return null;
  const db = await getAdminDb();
  const paths = contentPaths(kind);
  const [video, secret, owned] = await Promise.all([db.doc(`${paths.titles}/${videoId}`).get(), db.doc(`${paths.private}/${videoId}`).get(), db.doc(`${paths.entitlements}/${actor.uid}/${paths.items}/${videoId}`).get()]);
  const productId = secret.data()?.playProductId;
  if (!video.exists || video.data()?.status !== 'published' || video.data()?.priceCents <= 0 || video.data()?.creatorId === actor.uid || owned.data()?.status === 'active' || !PLAY_PRODUCT_PATTERN.test(productId || '')) return null;
  const product = await db.doc(`watchPlayProducts/${productId}`).get();
  if (product.data()?.videoId !== videoId || (product.data()?.contentKind || 'video') !== kind) return null;
  const test = playTester(actor.uid) && secret.data()?.playTestEnabled === true && product.data()?.enabled === true;
  const live = playLiveConfigured() && secret.data()?.playLiveEnabled === true && product.data()?.liveEnabled === true && (kind === 'audio' ? video.data()?.ready === true : secret.data()?.full?.ready === true);
  if (!test && !live) return null;
  if (live && (await db.doc(`watchCreators/${video.data()!.creatorId}`).get()).data()?.status !== 'approved') return null;
  return { productId, accountId: playAccountId(actor.uid), testOnly: !live };
}
export async function preparePlayPurchase(actor: AuthenticatedRequestUser, videoId: string, kind: ContentKind = 'video') {
  const offer = await getPlayOffer(actor, videoId, kind);
  if (!offer) throw new WatchError(409, 'This video is not available for checkout. If already purchased, use Restore purchases.');
  const db = await getAdminDb();
  const batch = db.batch();
  batch.set(db.doc(`watchPlayAccounts/${offer.accountId}`), { uid: actor.uid });
  batch.set(db.doc(checkoutPath(offer.accountId, offer.productId)), { uid: actor.uid, videoId, contentKind: kind, productId: offer.productId, liveAuthorized: !offer.testOnly, platformBps: VIDEO_PLATFORM_BPS, preparedAt: Date.now() });
  await batch.commit();
  return offer;
}

export function classifyPlayPurchase(purchase: PlayPurchase, acceptLive = false) {
  const items = purchase.productLineItem;
  if (items?.length !== 1 || !PLAY_PRODUCT_PATTERN.test(items[0].productId || '')) throw new WatchError(400, 'This is not an AfroBooks video purchase.');
  const offer = items[0].productOfferDetails;
  if (purchase.testPurchaseContext && purchase.testPurchaseContext.fopType !== 'TEST') throw new WatchError(409, 'Unknown Google purchase type.');
  if (!purchase.testPurchaseContext && !acceptLive) throw new WatchError(409, 'Real-money video sales are not enabled. This purchase requires support review.');
  if (offer?.rentOfferDetails || offer?.preorderOfferDetails || offer?.quantity !== 1) throw new WatchError(409, 'Only a single, non-rental video purchase is supported.');
  const state = purchase.purchaseStateContext?.purchaseState;
  if (state === 'CANCELLED') return 'revoked' as const;
  // An unpaid pending purchase may have no refundable quantity yet.
  if (state === 'PENDING') return 'pending' as const;
  if (state === 'PURCHASED' && offer.refundableQuantity === 0) return 'revoked' as const;
  if (state !== 'PURCHASED' || offer.refundableQuantity !== 1 || offer.consumptionState !== 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED') throw new WatchError(409, 'This purchase is not ready to unlock a video.');
  return 'active' as const;
}

// The token is the immutable transaction identity; Google order IDs can be absent.
// Revocation is terminal for a token and cannot revoke a newer repurchase.
export async function syncPlayPurchase(db: Firestore, token: string, uid?: string, expectedProductId?: string, client: PlayClient = googlePlay): Promise<PlayPurchaseResult> {
  playToken.parse(token);
  const purchase = await client.purchase(token);
  let status = classifyPlayPurchase(purchase, true);
  const testPurchase = purchase.testPurchaseContext?.fopType === 'TEST';
  const productId = purchase.productLineItem![0].productId!;
  if (expectedProductId && productId !== expectedProductId) throw new WatchError(403, 'The purchase does not match this video.');
  const accountId = purchase.obfuscatedExternalAccountId;
  if (!accountId || !/^[a-f0-9]{64}$/.test(accountId)) throw new WatchError(403, 'This purchase is not linked to an AfroBooks account.');
  if (uid && playAccountId(uid) !== accountId) throw new WatchError(403, 'This purchase belongs to another AfroBooks account.');
  const account = await db.doc(`watchPlayAccounts/${accountId}`).get();
  const buyerId = account.data()?.uid;
  if (typeof buyerId !== 'string' || playAccountId(buyerId) !== accountId || (uid && buyerId !== uid)) throw new WatchError(403, 'The purchase account could not be verified.');
  const purchaseId = playPurchaseId(token);
  const ref = db.doc(`watchPlayPurchases/${purchaseId}`);
  let finances: ReturnType<typeof playOrderEarnings> | null = null;
  if (!testPurchase && purchase.orderId && client.order) {
    try {
      const order = await client.order(purchase.orderId);
      finances = playOrderEarnings(order, purchase.orderId, token, productId);
      if (finances.status === 'reversed') status = 'revoked';
    } catch { /* Keep a durable pending earnings record; restore/RTDN/admin refresh retries. */ }
  }
  const result = await db.runTransaction(async tx => {
    const earningRef = db.doc(`watchPlayEarnings/${purchaseId}`);
    const [old, product, checkout, earning] = await tx.getAll(ref, db.doc(`watchPlayProducts/${productId}`), db.doc(checkoutPath(accountId, productId)), earningRef);
    const videoId = product.data()?.videoId;
    const kind: ContentKind = product.data()?.contentKind === 'audio' ? 'audio' : 'video';
    const paths = contentPaths(kind);
    if (!productId.startsWith(`afrobooks_${kind}_`)) throw new WatchError(403, 'Purchase content type mismatch.');
    if (typeof videoId !== 'string' || !watchId.safeParse(videoId).success) throw new WatchError(409, 'This Play product is not linked to a video.');
    if (old.exists && (old.data()?.buyerId !== buyerId || old.data()?.videoId !== videoId || old.data()?.productId !== productId || old.data()?.testPurchase !== testPurchase)) throw new WatchError(403, 'Purchase ownership mismatch.');
    const entitlementRef = db.doc(`${paths.entitlements}/${buyerId}/${paths.items}/${videoId}`);
    const [video, entitlement] = await tx.getAll(db.doc(`${paths.titles}/${videoId}`), entitlementRef);
    if (!old.exists && testPurchase && !playTester(buyerId) && !checkout.data()?.liveAuthorized) throw new WatchError(403, 'This account is not enabled for video purchase testing.');
    if (!old.exists && !testPurchase && (checkout.data()?.uid !== buyerId || checkout.data()?.videoId !== videoId || !checkout.data()?.liveAuthorized || checkout.data()?.platformBps !== VIDEO_PLATFORM_BPS)) throw new WatchError(403, 'Start this video purchase in AfroBooks before paying.');
    if (!video.exists || video.data()?.creatorId !== product.data()?.creatorId) throw new WatchError(409, 'Purchased content needs review.');
    const resolved = old.data()?.status === 'revoked' ? 'revoked' : old.data()?.status === 'active' && status === 'pending' ? 'active' : status;
    if (resolved === 'active' && entitlement.data()?.status === 'active' && entitlement.data()?.purchaseId !== purchaseId) throw new WatchError(409, 'This video is already owned. Contact support about the duplicate purchase.');
    const acknowledged = purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' || old.data()?.acknowledged === true;
    tx.set(ref, { buyerId, videoId, contentKind: kind, creatorId: product.data()!.creatorId, productId, purchaseToken: token, status: resolved, acknowledged, testPurchase, platformBps: old.data()?.platformBps ?? VIDEO_PLATFORM_BPS, orderId: purchase.orderId || null, updatedAt: Date.now(), createdAt: old.data()?.createdAt || Date.now() });
    if (!testPurchase) {
      const previous = earning.data();
      const money = finances && finances.googleEventAt >= (previous?.googleEventAt || 0) ? finances : previous;
      const reversed = resolved === 'revoked' || previous?.status === 'reversed';
      tx.set(earningRef, {
        videoId, contentKind: kind, videoTitle: video.data()!.title, creatorId: product.data()!.creatorId, buyerId, productId, orderId: purchase.orderId || null,
        platformBps: VIDEO_PLATFORM_BPS, status: reversed ? 'reversed' : money?.status || 'pending',
        currency: money?.currency || null, googleRevenueNanos: money?.googleRevenueNanos ?? null,
        creatorEarningsNanos: reversed ? '0' : money?.creatorEarningsNanos ?? null,
        platformEarningsNanos: reversed ? '0' : money?.platformEarningsNanos ?? null,
        googleEventAt: money?.googleEventAt || 0, updatedAt: Date.now(), createdAt: previous?.createdAt || Date.now(),
        financialVerifiedAt: finances && finances.googleEventAt >= (previous?.googleEventAt || 0) ? Date.now() : previous?.financialVerifiedAt || 0,
        payoutStatus: previous?.payoutStatus || 'unpaid',
      }, { merge: true });
    }
    if (resolved === 'active') {
      tx.set(entitlementRef, { status: 'active', provider: 'google_play', purchaseId, productId, testPurchase, updatedAt: Date.now() });
      tx.set(db.doc(`${paths.states}/${buyerId}/${paths.items}/${videoId}`), { saved: true, updatedAt: Date.now() }, { merge: true });
    } else if (resolved === 'revoked' && entitlement.data()?.purchaseId === purchaseId) {
      tx.update(entitlementRef, { status: 'revoked', updatedAt: Date.now() });
    }
    return { status: resolved, acknowledged, videoId } as PlayPurchaseResult;
  });
  if (result.status === 'active' && !result.acknowledged) {
    // Fulfillment is durable before acknowledgement. A failed acknowledgement
    // is retried by restore or authenticated RTDN, without duplicate grants.
    await client.acknowledge(productId, token);
    await ref.update({ acknowledged: true });
    result.acknowledged = true;
  }
  return result;
}

export async function syncPlayVoidedPurchase(db: Firestore, token: string, client: PlayClient = googlePlay) {
  playToken.parse(token);
  // Voided notifications contain no SKU and may belong to another product line.
  // An unknown token has no video grant to revoke. A later purchase notification
  // still fetches Google's current state before it can create a grant.
  if (!(await db.doc(`watchPlayPurchases/${playPurchaseId(token)}`).get()).exists) return;
  await syncPlayPurchase(db, token, undefined, undefined, client);
}

export async function verifyPlayPlayback(uid: string, videoId: string, kind: ContentKind = 'video') {
  const db = await getAdminDb();
  const paths = contentPaths(kind);
  const entitlement = await db.doc(`${paths.entitlements}/${uid}/${paths.items}/${videoId}`).get();
  if (entitlement.data()?.provider !== 'google_play') return;
  const purchase = await db.doc(`watchPlayPurchases/${entitlement.data()!.purchaseId}`).get();
  if (!purchase.exists || purchase.data()?.buyerId !== uid || purchase.data()?.videoId !== videoId) throw new WatchError(403, 'Restore your video purchase before playing.');
  const result = await syncPlayPurchase(db, purchase.data()!.purchaseToken, uid);
  if (result.status !== 'active') throw new WatchError(403, 'This purchase is no longer active.');
}
