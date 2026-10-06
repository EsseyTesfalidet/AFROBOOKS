import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { PLAY_PACKAGE, PLAY_PRODUCT_PATTERN } from '@/lib/watch/play';
import { syncPlayPurchase, syncPlayVoidedPurchase, playToken } from '@/lib/server/watchPlay';
import { verifyPlayNotification } from '@/lib/server/watchPlayClient';
import { watchBody, watchFailure, watchJson } from '@/lib/server/watchHttp';
import { MUSIC_PRODUCT } from '@/lib/music/policy';
import { syncMusic } from '@/lib/server/musicSubscriptions';
import { playPurchaseId } from '@/lib/server/watchPlay';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    await verifyPlayNotification(request.headers.get('authorization'));
    const body = z.object({ message: z.object({ data: z.string().max(16000), messageId: z.string().min(1).max(200) }) }).parse(await watchBody(request, 20000));
    const event = z.object({
      packageName: z.literal(PLAY_PACKAGE),
      testNotification: z.unknown().optional(),
      afrobooksInfrastructureProbe: z.literal(true).optional(),
      oneTimeProductNotification: z.object({ sku: z.string(), purchaseToken: playToken }).optional(),
      subscriptionNotification: z.object({ subscriptionId: z.string(), purchaseToken: playToken }).optional(),
      voidedPurchaseNotification: z.object({ purchaseToken: playToken, productType: z.number() }).optional(),
    }).parse(JSON.parse(Buffer.from(body.message.data, 'base64').toString('utf8')));
    if (event.testNotification) {
      const db = await getAdminDb();
      await db.doc('watchSystem/playNotifications').set(event.afrobooksInfrastructureProbe
        ? { lastInfrastructureProbeAt: Date.now(), infrastructureMessageId: body.message.messageId }
        : { lastTestAt: Date.now(), messageId: body.message.messageId }, { merge: true });
      return watchJson({ received: true });
    }
    const oneTime = event.oneTimeProductNotification;
    if (event.subscriptionNotification?.subscriptionId === MUSIC_PRODUCT) { await syncMusic(event.subscriptionNotification.purchaseToken); return watchJson({ received: true }); }
    if (event.voidedPurchaseNotification?.productType === 1) {
      const token = event.voidedPurchaseNotification.purchaseToken; const db = await getAdminDb();
      if ((await db.doc(`musicPurchases/${playPurchaseId(token)}`).get()).exists) await syncMusic(token);
      return watchJson({ received: true });
    }
    if (oneTime && !PLAY_PRODUCT_PATTERN.test(oneTime.sku)) return watchJson({ ignored: true });
    const token = oneTime?.purchaseToken || (event.voidedPurchaseNotification?.productType === 2 ? event.voidedPurchaseNotification.purchaseToken : null);
    if (!token) return watchJson({ received: true });
    // Notification bodies never grant/revoke access themselves. Always fetch Google.
    const db = await getAdminDb();
    if (oneTime) await syncPlayPurchase(db, token, undefined, oneTime.sku);
    else await syncPlayVoidedPurchase(db, token);
    return watchJson({ received: true });
  } catch (error) { return watchFailure(error); }
}
