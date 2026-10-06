import { createHash, randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { MUSIC_PRODUCT, MUSIC_BASE_PLAN, musicActive, musicShares } from '@/lib/music/policy';
import { playAccountId, playLiveConfigured, playPurchaseId, playTester, playToken } from './watchPlay';
import { playApiRequest, playConfigured, googlePlay, type PlayOrder } from './watchPlayClient';
import { playOrderEarnings } from './watchEarnings';
import { WatchError } from './watchErrors';
import type { AuthenticatedRequestUser as Actor } from './auth';

export interface MusicSubscription {
  subscriptionState?: string; acknowledgementState?: string; startTime?: string;
  testPurchase?: object; externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: { productId?: string; expiryTime?: string; latestSuccessfulOrderId?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean }; offerDetails?: { basePlanId?: string } }[];
}
export interface MusicClient {
  subscription(token: string): Promise<MusicSubscription>;
  acknowledge(token: string): Promise<void>;
  order(id: string): Promise<PlayOrder>;
}
export const musicClient: MusicClient = {
  subscription: token => playApiRequest(`purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`),
  acknowledge: token => playApiRequest(`purchases/subscriptions/${MUSIC_PRODUCT}/tokens/${encodeURIComponent(token)}:acknowledge`, {}),
  order: id => googlePlay.order!(id),
};
const orderKey = (id: string) => createHash('sha256').update(id).digest('hex');
export async function musicStatus(actor: Actor) {
  const db = await getAdminDb();
  const [settings, access] = await Promise.all([db.doc('musicSystem/settings').get(), db.doc(`musicAccess/${actor.uid}`).get()]);
  const state = access.data();
  const active = !!state && musicActive(state.state, state.expiresAt);
  const live = settings.data()?.liveEnabled === true && playLiveConfigured();
  const test = settings.data()?.testEnabled === true && playConfigured() && playTester(actor.uid);
  return { active, expiresAt: state?.expiresAt || 0, autoRenew: state?.autoRenew === true, available: live || test, testOnly: !live, productId: MUSIC_PRODUCT, accountId: playAccountId(actor.uid) };
}
export async function prepareMusic(actor: Actor) {
  const status = await musicStatus(actor);
  if (status.active) throw new WatchError(409, 'Your music subscription is already active.');
  if (!status.available) throw new WatchError(409, 'Music subscriptions are not available for checkout yet.');
  const db = await getAdminDb(); const batch = db.batch();
  batch.set(db.doc(`watchPlayAccounts/${status.accountId}`), { uid: actor.uid });
  batch.set(db.doc(`musicCheckouts/${actor.uid}`), { liveAuthorized: !status.testOnly, preparedAt: Date.now() }); await batch.commit(); return status;
}
export async function syncMusic(token: string, uid?: string, client: MusicClient = musicClient) {
  playToken.parse(token); const purchase = await client.subscription(token); const items = purchase.lineItems;
  if (items?.length !== 1 || items[0].productId !== MUSIC_PRODUCT || items[0].offerDetails?.basePlanId !== MUSIC_BASE_PLAN || !items[0].autoRenewingPlan) throw new WatchError(400, 'This is not an AfroBooks monthly music subscription.');
  const accountId = purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  if (!accountId || !/^[a-f0-9]{64}$/.test(accountId) || (uid && playAccountId(uid) !== accountId)) throw new WatchError(403, 'This subscription belongs to another AfroBooks account.');
  const db = await getAdminDb(); const account = await db.doc(`watchPlayAccounts/${accountId}`).get(); const buyerId = account.data()?.uid;
  if (typeof buyerId !== 'string' || playAccountId(buyerId) !== accountId || (uid && buyerId !== uid)) throw new WatchError(403, 'The subscription account could not be verified.');
  const expiresAt = Date.parse(items[0].expiryTime || ''); const startAt = Date.parse(purchase.startTime || ''); const state = purchase.subscriptionState || '';
  if (!Number.isFinite(expiresAt) || !Number.isFinite(startAt)) throw new WatchError(409, 'Google has not confirmed this subscription yet. Restore after payment completes; do not pay again.');
  const id = playPurchaseId(token), test = !!purchase.testPurchase, latestOrder = items[0].latestSuccessfulOrderId || '';
  const ref = db.doc(`musicPurchases/${id}`), accessRef = db.doc(`musicAccess/${buyerId}`);
  const acknowledged = purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
  const effective = await db.runTransaction(async tx => {
    const [old, access, checkout] = await Promise.all([tx.get(ref), tx.get(accessRef), tx.get(db.doc(`musicCheckouts/${buyerId}`))]);
    if (old.exists && (old.data()?.buyerId !== buyerId || old.data()?.test !== test)) throw new WatchError(403, 'Subscription ownership mismatch.');
    if (!old.exists && ((!test && !checkout.data()?.liveAuthorized) || (test && !playTester(buyerId) && !checkout.data()?.liveAuthorized))) throw new WatchError(403, 'Start the music subscription in AfroBooks first.');
    // An older canceled token must never replace a newer subscription.
    const terminal = old.data()?.state === 'SUBSCRIPTION_STATE_EXPIRED';
    const resolved = terminal ? 'SUBSCRIPTION_STATE_EXPIRED' : state;
    tx.set(ref, { buyerId, token, test, state: resolved, expiresAt, startAt, latestOrder, acknowledged: acknowledged || old.data()?.acknowledged === true, updatedAt: Date.now() });
    if (!access.exists || access.data()?.purchaseId === id || (startAt >= (access.data()?.startAt || 0) && musicActive(resolved, expiresAt))) tx.set(accessRef, { purchaseId: id, state: resolved, expiresAt, startAt, test, latestOrder, autoRenew: items[0].autoRenewingPlan?.autoRenewEnabled === true, updatedAt: Date.now() });
    return { state: resolved, acknowledged: acknowledged || old.data()?.acknowledged === true };
  });
  if (musicActive(effective.state, expiresAt) && !effective.acknowledged) { await client.acknowledge(token); await ref.update({ acknowledged: true }); }
  if (!test && latestOrder) {
    const key = orderKey(latestOrder); const orderRef = db.doc(`musicOrders/${key}`);
    await db.runTransaction(async tx => {
      const old = await tx.get(orderRef);
      if (old.exists && (old.data()?.buyerId !== buyerId || old.data()?.purchaseId !== id)) throw new WatchError(403, 'Subscription order ownership mismatch.');
      tx.set(orderRef, { buyerId, purchaseId: id, orderId: latestOrder, cycleEndsAt: expiresAt, createdAt: old.data()?.createdAt || Date.now(), updatedAt: Date.now() }, { merge: true });
    });
    try { await reconcileMusicOrder(key, client); } catch { /* Durable pending order; scheduled reconciliation retries financial verification. */ }
  }
  return { active: musicActive(effective.state, expiresAt), expiresAt };
}
export async function musicAccess(actor: Actor) {
  const db = await getAdminDb(); const access = (await db.doc(`musicAccess/${actor.uid}`).get()).data();
  if (!access?.purchaseId) throw new WatchError(403, 'Subscribe to Music to listen to this title.');
  const purchase = (await db.doc(`musicPurchases/${access.purchaseId}`).get()).data();
  if (!purchase || purchase.buyerId !== actor.uid) throw new WatchError(403, 'Restore your music subscription.');
  const result = await syncMusic(purchase.token, actor.uid);
  if (!result.active) throw new WatchError(403, 'Your music subscription is not active. Restore it or subscribe to continue.');
  return result;
}
export async function musicSession(actor: Actor, titleId: string, creatorId: string, position: number) {
  const db = await getAdminDb(); const access = (await db.doc(`musicAccess/${actor.uid}`).get()).data();
  if (!access || !musicActive(access.state, access.expiresAt)) return null;
  const sessionId = randomUUID();
  await db.doc(`musicSessions/${actor.uid}`).set({ sessionId, titleId, creatorId, orderKey: access.latestOrder && !access.test ? orderKey(access.latestOrder) : '', position, at: Date.now(), expiresAt: access.expiresAt });
  return sessionId;
}
export async function recordMusicListening(actor: Actor, titleId: string, sessionId: unknown, position: number) {
  if (typeof sessionId !== 'string') return;
  const db = await getAdminDb(); const ref = db.doc(`musicSessions/${actor.uid}`);
  await db.runTransaction(async tx => {
    const value = (await tx.get(ref)).data(); const now = Date.now();
    if (!value || value.sessionId !== sessionId || value.titleId !== titleId || value.expiresAt <= now) return;
    const seconds = Math.floor(Math.max(0, Math.min(60, (now - value.at) / 1000, position - value.position)));
    const ledger = value.orderKey ? db.doc(`musicOrders/${value.orderKey}/listening/${value.creatorId}`) : null;
    const [old, order] = ledger ? await Promise.all([tx.get(ledger), tx.get(db.doc(`musicOrders/${value.orderKey}`))]) : [null, null];
    tx.update(ref, { position, at: now });
    if (ledger && seconds > 0 && order?.exists && order.data()?.buyerId === actor.uid && order.data()?.cycleEndsAt > now && !order.data()?.allocatedAt) tx.set(ledger, { creatorId: value.creatorId, seconds: (old?.data()?.seconds || 0) + seconds });
  });
}
export async function reconcileMusicOrder(key: string, client: MusicClient = musicClient, now = Date.now()) {
  const db = await getAdminDb(); const ref = db.doc(`musicOrders/${key}`); const value = (await ref.get()).data(); if (!value) return;
  const purchase = (await db.doc(`musicPurchases/${value.purchaseId}`).get()).data(); if (!purchase || purchase.test) return;
  const money = playOrderEarnings(await client.order(value.orderId), value.orderId, purchase.token, MUSIC_PRODUCT);
  await db.runTransaction(async tx => {
    const [current, listening] = await Promise.all([tx.get(ref), tx.get(ref.collection('listening').limit(201))]);
    if (!current.exists || money.googleEventAt < (current.data()?.googleEventAt || 0)) return;
    if (current.data()?.status === 'reversed' && money.status !== 'reversed') return;
    if (listening.size > 200) throw new WatchError(409, 'This music cycle needs a payout review.');
    const listeners = listening.docs.map(row => ({ creatorId: row.id, seconds: row.data().seconds }));
    const shares = musicShares(BigInt(money.creatorEarningsNanos), listeners);
    // Payouts wait for the full billing cycle and confirmed financial data.
    const allocate = value.cycleEndsAt <= now && (current.data()?.allocatedAt || ['accrued', 'reversed'].includes(money.status)) && shares.length > 0;
    tx.set(ref, { ...money, financialVerifiedAt: now, ...(allocate ? { allocatedAt: now } : {}) }, { merge: true });
    if (allocate) for (const share of shares) tx.set(db.doc(`watchPlayEarnings/music_${key}_${share.creatorId}`), {
      videoId: MUSIC_PRODUCT, videoTitle: 'Music subscription · listener share', contentKind: 'music_subscription', creatorId: share.creatorId, buyerId: value.buyerId, productId: MUSIC_PRODUCT, orderId: value.orderId,
      platformBps: 2000, status: money.status, currency: money.currency, creatorEarningsNanos: share.amount,
      // The pool totals remain on musicOrders; avoid double-counting them per artist.
      googleRevenueNanos: null, platformEarningsNanos: null, googleEventAt: money.googleEventAt, financialVerifiedAt: now, updatedAt: now, createdAt: value.cycleEndsAt,
    }, { merge: true });
  });
}
export async function reconcileMusic() {
  const db = await getAdminDb(); const job = db.doc('musicSystem/reconciliation'); const owner = randomUUID(); const now = Date.now();
  const cursor = await db.runTransaction(async tx => { const value = (await tx.get(job)).data(); if (value?.leaseUntil > now) return null; tx.set(job, { leaseOwner: owner, leaseUntil: now + 10 * 60000 }, { merge: true }); return { purchases: value?.purchases || '', orders: value?.orders || '' }; });
  if (!cursor) return { busy: true, failed: 0 };
  let failed = 0;
  try {
    let purchases = db.collection('musicPurchases').orderBy(FieldPath.documentId()); if (cursor.purchases) purchases = purchases.startAfter(cursor.purchases);
    let orders = db.collection('musicOrders').orderBy(FieldPath.documentId()); if (cursor.orders) orders = orders.startAfter(cursor.orders);
    const [p, o] = await Promise.all([purchases.limit(5).get(), orders.limit(5).get()]);
    for (const row of p.docs) try { await syncMusic(row.data().token); } catch { failed++; }
    for (const row of o.docs) try { await reconcileMusicOrder(row.id); } catch { failed++; }
    await job.set({ purchases: p.size === 5 ? p.docs[4].id : '', orders: o.size === 5 ? o.docs[4].id : '', failed, lastRunAt: now }, { merge: true });
  } finally { await db.runTransaction(async tx => { if ((await tx.get(job)).data()?.leaseOwner === owner) tx.update(job, { leaseUntil: 0 }); }); }
  return { busy: false, failed };
}
export async function configureMusic(actor: Actor, data: unknown) {
  if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.');
  const settings = z.object({ testEnabled: z.boolean(), liveEnabled: z.boolean() }).parse(data); const db = await getAdminDb();
  if (settings.liveEnabled) {
    if (!playLiveConfigured() || !(await db.doc('watchSystem/playNotifications').get()).data()?.lastTestAt) throw new WatchError(409, 'Complete Google Play setup and send a successful notification test first.');
    const product = await playApiRequest<{ basePlans?: { basePlanId: string; state: string; autoRenewingBasePlanType?: { billingPeriodDuration: string } }[] }>(`subscriptions/${MUSIC_PRODUCT}`);
    if (product.basePlans?.length !== 1 || product.basePlans[0].basePlanId !== MUSIC_BASE_PLAN || product.basePlans[0].state !== 'ACTIVE' || product.basePlans[0].autoRenewingBasePlanType?.billingPeriodDuration !== 'P1M') throw new WatchError(409, 'Activate one monthly auto-renewing base plan named monthly in Play Console.');
  }
  await db.doc('musicSystem/settings').set({ ...settings, updatedAt: Date.now(), actorId: actor.uid }); return { ok: true };
}
