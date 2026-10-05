import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadReservation } from '../lib/watch/upload';

test('automatic upload allowance rounds lengths without exceeding video and trailer limits', () => {
  assert.equal(uploadReservation(3, false), 60);
  assert.equal(uploadReservation(121.5, false), 180);
  assert.equal(uploadReservation(300, true), 300);
  assert.equal(uploadReservation(10800, false), 10800);
  for (const value of [NaN, Infinity, 0, -1, 10800.1]) assert.throws(() => uploadReservation(value, false));
  assert.throws(() => uploadReservation(300.1, true), /five minutes/);
});
