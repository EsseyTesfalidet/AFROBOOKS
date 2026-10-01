import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { getAdminDb } from '@/lib/firebase/admin';
import { getStripeServer } from '@/lib/stripe/server';
import { confirmBookPurchase } from '@/lib/server/confirmBookPurchase';
import { sendBookRoyalties } from '@/lib/server/authorPayments';

const input = z.object({ orderIds: z.array(z.string().min(1).max(128).regex(/^[^/]+$/)).min(1).max(20) });
export async function POST(req: NextRequest) {
  try {
    const user = await requireRequestUser(req);
    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid receipt' }, { status: 400 });
    const db = await getAdminDb();
    const stripe = getStripeServer();
    const confirmed = await confirmBookPurchase(db, stripe, user.uid, [...new Set(parsed.data.orderIds)]);
    for (const id of confirmed) await sendBookRoyalties(db, stripe, id).catch(() => console.error('Receipt royalty transfer deferred to scheduled retry'));
    return NextResponse.json({ checked: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const unauthorized = error instanceof Error && ['Unauthorized', 'Unauthorized receipt'].includes(error.message);
    return NextResponse.json({ error: unauthorized ? 'Receipt unavailable' : 'Payment confirmation pending. Please do not pay again.' }, { status: unauthorized ? 403 : 503 });
  }
}
