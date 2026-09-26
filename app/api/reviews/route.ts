import { createPurchaseReview } from '@/lib/server/social';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';

const schema = z.object({
  bookId: z.string().min(1).max(128).regex(/^[^/]+$/),
  title: z.string().trim().min(3).max(200), body: z.string().trim().min(20).max(10000),
  stars: z.number().int().min(1).max(5),
}).strict();

export async function POST(req: NextRequest) {
  try {
    const user = await requireRequestUser(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid review' }, { status: 400 });
    const { bookId, ...content } = parsed.data;
    const db = await getAdminDb();
    const id = await createPurchaseReview(db, user.uid, { bookId, ...content });
    return NextResponse.json({ id });
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save review' }, { status });
  }
}
