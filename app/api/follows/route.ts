import { updateFollow } from '@/lib/server/social';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';

const schema = z.object({ sellerId: z.string().min(1).max(128).regex(/^[^/]+$/), following: z.boolean() }).strict();
export async function POST(req: NextRequest) {
  try {
    const user = await requireRequestUser(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success || parsed.data.sellerId === user.uid) return NextResponse.json({ error: 'Invalid author' }, { status: 400 });
    const { sellerId, following } = parsed.data;
    const db = await getAdminDb();
    await updateFollow(db, user.uid, sellerId, following);
    return NextResponse.json({ following });
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: 'Unable to update follow' }, { status });
  }
}
