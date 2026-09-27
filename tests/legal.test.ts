import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_VERSION, hasCurrentAgreement } from '../lib/legal';
import { agreementRequiredResponse } from '../lib/server/legalAgreement';

test('missing, partial and outdated legal acceptance cannot authorize new transactions', async () => {
  const current = { termsVersion: LEGAL_VERSION, privacyVersion: LEGAL_VERSION, acceptedAt: 100 };
  for (const profile of [
    undefined,
    {},
    { legalAgreement: { ...current, termsVersion: 'old' } },
    { legalAgreement: { ...current, privacyVersion: 'old' } },
    { legalAgreement: { ...current, acceptedAt: 0 } },
  ]) {
    assert.equal(hasCurrentAgreement(profile), false);
    const response = agreementRequiredResponse(profile)!;
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'agreement_required');
  }
  assert.equal(hasCurrentAgreement({ legalAgreement: current }), true);
  assert.equal(agreementRequiredResponse({ legalAgreement: current }), null);
});
