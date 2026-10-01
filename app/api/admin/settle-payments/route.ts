import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { getAdminDb } from '@/lib/firebase/admin';
import { getStripeServer } from '@/lib/stripe/server';
import { reviewAdminSettlement } from '@/lib/server/adminSettlement';

const input = z.object({ sellerId: z.string().min(1).max(128).regex(/^[^/]+$/) });
export async function POST(request: NextRequest) {
  try {
    const actor = await requireRequestUser(request);
    if (actor.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid author' }, { status: 400 });
    const result = await reviewAdminSettlement(await getAdminDb(), getStripeServer(), actor, parsed.data.sellerId);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'Unauthorized';
    return NextResponse.json({ error: unauthorized ? 'Admin sign-in required' : 'Settlement could not be verified. No new payments or refunds were issued. Try again.' }, { status: unauthorized ? 401 : 503 });
  }
}
