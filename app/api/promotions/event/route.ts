import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { recordPromotionEvent } from '@/lib/server/promotions';

const schema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  kind: z.enum(['view', 'click']),
});
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireRequestUser(req);
  } catch {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  try {
    await recordPromotionEvent(await getAdminDb(), user.uid, parsed.data.id, parsed.data.kind);
    return NextResponse.json({ received: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Event unavailable.' }, { status: 503 });
  }
}
