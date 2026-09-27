import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { promotionCandidates } from '@/lib/server/promotions';

export async function GET() {
  try {
    const candidates = await promotionCandidates(await getAdminDb());
    const placement = candidates.length ? candidates[randomInt(candidates.length)] : null;
    // Public response contains no owner, payment, targeting, or private book data.
    return NextResponse.json({ placement }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { placement: null },
      { headers: { 'Cache-Control': 'no-store' }, status: 503 },
    );
  }
}
