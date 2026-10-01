import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { getAdminDb } from '@/lib/firebase/admin';
import { getStripeServer } from '@/lib/stripe/server';
import { reconcileLibrary } from '@/lib/server/reconcileLibrary';
import { sendBookRoyalties } from '@/lib/server/authorPayments';

const id = z.string().min(1).max(128).regex(/^[^/]+$/);
const input = z.object({ bookId: id.optional(), cursor: id.optional() }).strict();
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await requireRequestUser(request);
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid library request' }, { status: 400 });
    const db = await getAdminDb();
    const stripe = getStripeServer();
    const result = await reconcileLibrary(db, stripe, user.uid, parsed.data);
    for (const paymentId of result.confirmed) {
      await sendBookRoyalties(db, stripe, paymentId).catch(() => console.error('Library royalty transfer deferred to scheduled retry'));
    }
    return NextResponse.json({ restored: result.restored, pendingOrderIds: result.pendingOrderIds, nextCursor: result.nextCursor }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'Unauthorized';
    return NextResponse.json({ error: unauthorized ? 'Please sign in to open your library.' : 'Your purchases could not be checked. Please try again; do not pay again.' }, { status: unauthorized ? 401 : 503 });
  }
}
