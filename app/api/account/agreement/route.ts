import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { getAdminDb } from '@/lib/firebase/admin';
import { agreementSchema, recordLegalAgreement } from '@/lib/server/legalAgreement';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRequestUser(request);
    const parsed = agreementSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Review both current documents and check the agreement box before continuing.' },
        { status: 400 },
      );
    const agreement = await recordLegalAgreement(await getAdminDb(), user.uid, parsed.data);
    return NextResponse.json({ agreement }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const unauthorized =
      (error as { message?: string }).message === 'Unauthorized' ||
      (error as { code?: string }).code?.startsWith('auth/');
    return NextResponse.json(
      {
        error: unauthorized
          ? 'Please sign in again to save your agreement.'
          : 'Your agreement could not be saved. Please try again.',
      },
      { status: unauthorized ? 401 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
