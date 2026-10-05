import type { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { reconcileVideoPurchases } from '@/lib/server/watchJobs';
import { runVideoPayouts } from '@/lib/server/watchPayouts';
import { processWatchSubmissions } from '@/lib/server/watchProcessing';
import { repairWatchPosters } from '@/lib/server/watchPosters';
import { verifyGooglePush } from '@/lib/server/watchPlayClient';
import { watchFailure, watchJson } from '@/lib/server/watchHttp';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  try {
    await verifyGooglePush(request.headers.get('authorization'), process.env.GOOGLE_PLAY_JOBS_AUDIENCE, process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL);
    const db = await getAdminDb();
    const [payments, processing, artwork] = await Promise.all([
      (async () => ({ reconciliation: await reconcileVideoPurchases(db), payouts: await runVideoPayouts(db) }))(),
      processWatchSubmissions(db),
      repairWatchPosters(db),
    ]);
    return watchJson({ ...payments, processing, artwork });
  } catch (error) { return watchFailure(error); }
}
