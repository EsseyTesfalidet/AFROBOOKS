import { getAdminDb } from '@/lib/firebase/admin';
import { VIDEO_PLATFORM_BPS, type VideoEarning } from '@/lib/watch/play';
import type { AuthenticatedRequestUser } from './auth';
import type { PlayOrder } from './watchPlayClient';
import { WatchError } from './watchErrors';

// Google reports actual net revenue, already adjusted for its fees, taxes and
// refunds. Keep integer nanounits so currencies and tiny adjustments stay exact.
export function playOrderEarnings(order: PlayOrder, orderId: string, token: string, productId: string, platformBps = VIDEO_PLATFORM_BPS) {
  if (order.orderId !== orderId || order.purchaseToken !== token || order.lineItems?.length !== 1 || order.lineItems[0].productId !== productId) throw new WatchError(409, 'Google order details do not match this purchase.');
  if (!['PROCESSED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELED', 'PENDING', 'PENDING_REFUND'].includes(order.state || '')) throw new WatchError(409, 'Google order details are not ready.');
  const googleEventAt = Date.parse(order.lastEventTime || '');
  if (!Number.isFinite(googleEventAt)) throw new WatchError(409, 'Google order timing is not ready.');
  if (!Number.isInteger(platformBps) || platformBps < 0 || platformBps > 10000) throw new WatchError(409, 'The revenue share needs review.');
  const money = order.developerRevenueInBuyerCurrency;
  if (!money || !/^[A-Z]{3}$/.test(money.currencyCode || '') || !/^-?\d{1,16}$/.test(money.units || '0') || !Number.isInteger(money.nanos ?? 0) || Math.abs(money.nanos || 0) >= 1e9) throw new WatchError(409, 'Google has not confirmed net earnings yet.');
  const units = BigInt(money.units || '0'); const nanos = BigInt(money.nanos || 0);
  if ((units > BigInt(0) && nanos < BigInt(0)) || (units < BigInt(0) && nanos > BigInt(0))) throw new WatchError(409, 'Google net earnings need review.');
  const net = units * BigInt(1e9) + nanos;
  const reversed = order.state === 'REFUNDED' || order.state === 'CANCELED';
  const shareable = reversed || net < BigInt(0) ? BigInt(0) : net;
  const platform = shareable * BigInt(platformBps) / BigInt(10000);
  return {
    status: (reversed ? 'reversed' : order.state === 'PENDING_REFUND' ? 'refund_pending' : order.state === 'PENDING' ? 'pending' : 'accrued') as VideoEarning['status'],
    currency: money.currencyCode!, googleRevenueNanos: net.toString(),
    creatorEarningsNanos: (shareable - platform).toString(), platformEarningsNanos: platform.toString(), googleEventAt,
  };
}

export async function getVideoEarnings(actor: AuthenticatedRequestUser) {
  if (!['admin', 'seller', 'both'].includes(actor.role)) throw new WatchError(403, 'Creator access required.');
  const db = await getAdminDb();
  const query = actor.role === 'admin' ? db.collection('watchPlayEarnings').orderBy('updatedAt', 'desc') : db.collection('watchPlayEarnings').where('creatorId', '==', actor.uid);
  const rows = await query.limit(100).get();
  return rows.docs.map(doc => {
    const e = doc.data();
    return { id: doc.id, contentKind: e.contentKind || 'video', videoId: e.videoId, videoTitle: e.videoTitle, creatorId: e.creatorId, orderId: e.orderId,
      status: e.status, currency: e.currency, googleRevenueNanos: e.googleRevenueNanos,
      creatorEarningsNanos: e.creatorEarningsNanos, platformEarningsNanos: e.platformEarningsNanos, updatedAt: e.updatedAt } as VideoEarning;
  });
}
