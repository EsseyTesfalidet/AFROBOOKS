import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promotionIsOpen, promotionLabel, promotionSettings } from '../lib/promotions';
import type { Promotion } from '../types/promotion';

test('promotion defaults are free; malformed pricing cannot create a free paid offer', () => {
  assert.deepEqual(promotionSettings(), { enabled: true, priceCents: 0, durationDays: 7 });
  assert.deepEqual(promotionSettings({ enabled: true, priceCents: 900 }), {
    enabled: true,
    priceCents: 900,
    durationDays: 7,
  });
  for (const priceCents of [-1, 20, 99, 1.5, 100001, '900', NaN])
    assert.equal(promotionSettings({ enabled: true, priceCents }).enabled, false);
});
test('completed campaigns release their slot but payment reviews remain open', () => {
  const item = { status: 'active', endsAt: 100 } as Promotion;
  assert.equal(promotionLabel(item, 99), 'Running');
  assert.equal(promotionLabel(item, 100), 'Completed');
  assert.equal(promotionIsOpen(item, 100), false);
  assert.equal(promotionIsOpen({ ...item, status: 'needs_review' }, 100), true);
});
