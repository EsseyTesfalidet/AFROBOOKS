export const LEGAL_VERSION = '2026-09-27';
export const LEGAL_CONTACT = 'afrobooks.services@gmail.com';
export function hasCurrentAgreement(
  value?: {
    legalAgreement?: { termsVersion?: string; privacyVersion?: string; acceptedAt?: number };
  } | null,
) {
  const agreement = value?.legalAgreement;
  return (
    agreement?.termsVersion === LEGAL_VERSION &&
    agreement?.privacyVersion === LEGAL_VERSION &&
    Number.isSafeInteger(agreement?.acceptedAt) &&
    (agreement?.acceptedAt ?? 0) > 0
  );
}
