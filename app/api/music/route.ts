import type { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { configureMusic, musicStatus, prepareMusic, reconcileMusic, reconcileMusicOrder, syncMusic } from '@/lib/server/musicSubscriptions';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { watchActor, watchBody, watchFailure, watchJson } from '@/lib/server/watchHttp';
import { watchRateLimit } from '@/lib/server/watch';
import { WatchError } from '@/lib/server/watchErrors';
import { playToken } from '@/lib/server/watchPlay';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const actor = await watchActor(request); await watchRateLimit(actor, 'music_read', 60);
    if (request.nextUrl.searchParams.get('view') === 'admin') {
      if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.');
      const db = await getAdminDb(); const [settings, orders] = await Promise.all([db.doc('musicSystem/settings').get(), db.collection('musicOrders').orderBy('createdAt', 'desc').limit(50).get()]);
      return watchJson({ settings: { testEnabled: settings.data()?.testEnabled === true, liveEnabled: settings.data()?.liveEnabled === true }, orders: orders.docs.map(row => { const v = row.data(); return { id: row.id, currency: v.currency || null, status: v.status || 'pending', creatorPool: v.creatorEarningsNanos || null, allocated: !!v.allocatedAt, cycleEndsAt: v.cycleEndsAt }; }) });
    }
    return watchJson(await musicStatus(actor));
  }
  catch (error) { return watchFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await watchActor(request, true); await watchRateLimit(actor, 'music_write', 30); const body = await watchBody(request, 8000);
    if (body.action === 'prepare') return watchJson(await prepareMusic(actor));
    if (body.action === 'verify') return watchJson(await syncMusic(playToken.parse(body.purchaseToken), actor.uid));
    if (body.action === 'settings') return watchJson(await configureMusic(actor, body.data));
    if (body.action === 'refresh_earning') {
      const id = z.string().regex(/^music_[a-f0-9]{64}_[A-Za-z0-9_-]+$/).parse(body.id); const db = await getAdminDb(); const earning = (await db.doc(`watchPlayEarnings/${id}`).get()).data();
      if (!earning || earning.contentKind !== 'music_subscription' || (actor.role !== 'admin' && earning.creatorId !== actor.uid)) throw new WatchError(403, 'This earning is unavailable.');
      await reconcileMusicOrder(createHash('sha256').update(earning.orderId).digest('hex')); return watchJson({ ok: true });
    }
    if (body.action === 'reconcile') { if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.'); return watchJson(await reconcileMusic()); }
    if (body.action === 'restore') {
      const db = await getAdminDb(); const access = (await db.doc(`musicAccess/${actor.uid}`).get()).data();
      if (access?.purchaseId) { const purchase = (await db.doc(`musicPurchases/${access.purchaseId}`).get()).data(); if (purchase?.buyerId === actor.uid) await syncMusic(purchase.token, actor.uid); }
      return watchJson(await musicStatus(actor));
    }
    throw new WatchError(400, 'Unknown music action.');
  } catch (error) { return watchFailure(error); }
}
