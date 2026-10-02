import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { getAdminDb } from '@/lib/firebase/admin';
import { getStripeServer } from '@/lib/stripe/server';
import { recoverBookCheckout } from '@/lib/server/recoverBookCheckout';

const input = z.object({ orderIds: z.array(z.string().min(1).max(128).regex(/^[^/]+$/)).min(1).max(20) });
export async function POST(req: NextRequest) {
  try {
    const user = await requireRequestUser(req);
    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid receipt' }, { status: 400 });
    const state = await recoverBookCheckout(await getAdminDb(), getStripeServer(), user.uid, [...new Set(parsed.data.orderIds)]);
    return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const unauthorized = error instanceof Error && ['Unauthorized', 'Unauthorized receipt'].includes(error.message);
    return NextResponse.json({ error: unauthorized ? 'Receipt unavailable for this account.' : 'We could not check your payment yet. Please do not pay again.' }, { status: unauthorized ? 403 : 503 });
  }
}
