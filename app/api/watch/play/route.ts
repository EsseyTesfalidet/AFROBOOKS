import type { NextRequest } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { watchId } from '@/lib/watch/policy';
import { watchRateLimit } from '@/lib/server/watch';
import { preparePlayPurchase, playProductId, playToken, syncPlayPurchase } from '@/lib/server/watchPlay';
import { watchActor, watchBody, watchFailure, watchJson } from '@/lib/server/watchHttp';
export const runtime = 'nodejs';
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), videoId: watchId }).strict(),
  z.object({ action: z.literal('verify'), productId: playProductId, purchaseToken: playToken }).strict(),
  z.object({ action: z.literal('reconcile'), cursor: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
]);
export async function POST(request: NextRequest) {
  try {
    const actor = await watchActor(request, true);
    await watchRateLimit(actor, 'play', 60);
    const body = bodySchema.parse(await watchBody(request, 8000));
    if (body.action === 'prepare') return watchJson(await preparePlayPurchase(actor, body.videoId));
    const db = await getAdminDb();
    if (body.action === 'verify') return watchJson(await syncPlayPurchase(db, body.purchaseToken, actor.uid, body.productId));
    // Recheck server-known purchases too: refunded tokens disappear from listPurchases.
    let query = db.collection('watchPlayPurchases').where('buyerId', '==', actor.uid).orderBy(FieldPath.documentId());
    if (body.cursor) query = query.startAfter(body.cursor);
    const rows = await query.limit(6).get();
    const page = rows.docs.slice(0, 5);
    const results = await Promise.all(page.map(doc => syncPlayPurchase(db, doc.data().purchaseToken, actor.uid)));
    return watchJson({ results, next: rows.size > 5 ? page[page.length - 1].id : null });
  } catch (error) { return watchFailure(error); }
}
