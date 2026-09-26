import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { getAdminDb } from '@/lib/firebase/admin';
import { cancelUserSubscription } from '@/lib/server/cancelSubscription';
export async function POST(request: NextRequest) {
  try {
    const user = await requireRequestUser(request);
    await cancelUserSubscription(await getAdminDb(), user.uid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    console.error('Subscription cancellation failed:', error);
    return NextResponse.json({ error: 'Unable to cancel renewal. Please try again.' }, { status: 500 });
  }
}
