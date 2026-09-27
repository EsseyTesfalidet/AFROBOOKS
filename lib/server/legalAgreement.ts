import { type Firestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasCurrentAgreement, LEGAL_VERSION } from '../legal';

export const agreementSchema = z
  .object({
    termsAccepted: z.literal(true),
    privacyAcknowledged: z.literal(true),
    version: z.literal(LEGAL_VERSION),
  })
  .strict();

export function agreementRequiredResponse(user: Parameters<typeof hasCurrentAgreement>[0]) {
  return hasCurrentAgreement(user)
    ? null
    : NextResponse.json(
        {
          error:
            'Please review and accept the current Terms of use and Privacy information before continuing.',
          code: 'agreement_required',
        },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
}

export async function recordLegalAgreement(db: Firestore, uid: string, input: unknown) {
  agreementSchema.parse(input);
  const userRef = db.doc(`users/${uid}`);
  const receiptRef = db.doc(`legalAgreements/${uid}/versions/${LEGAL_VERSION}`);
  return db.runTransaction(async (tx) => {
    const [user, receipt] = await Promise.all([tx.get(userRef), tx.get(receiptRef)]);
    if (!user.exists || ['banned', 'suspended'].includes(user.data()?.status))
      throw new Error('Unauthorized');
    const agreement = receipt.exists
      ? receipt.data()!
      : {
          termsVersion: LEGAL_VERSION,
          privacyVersion: LEGAL_VERSION,
          acceptedAt: Date.now(),
        };
    // A retried request must not change the original acceptance timestamp.
    if (!receipt.exists) tx.create(receiptRef, agreement);
    tx.update(userRef, { legalAgreement: agreement });
    return agreement as { termsVersion: string; privacyVersion: string; acceptedAt: number };
  });
}
