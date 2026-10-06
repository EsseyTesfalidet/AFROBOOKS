import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullRefreshDistance, shouldPullRefresh, PULL_REFRESH_TRIGGER } from '../lib/app/pullRefresh';
import { classifyPlayerSwipe, PLAYER_SWIPE_THRESHOLD } from '../lib/audio/playerGestures';

test('pull-to-refresh recognizes a deliberate vertical drag and ignores horizontal shelf swipes', () => {
  assert.equal(pullRefreshDistance(0, 7), 0);
  assert.equal(pullRefreshDistance(80, 30), 0);
  assert.equal(pullRefreshDistance(0, 40), 23.04);
  assert.equal(shouldPullRefresh(PULL_REFRESH_TRIGGER - 0.1), false);
  assert.equal(shouldPullRefresh(PULL_REFRESH_TRIGGER), true);
  assert.equal(pullRefreshDistance(0, 100), 66.24);
  assert.equal(pullRefreshDistance(0, 400), 72);
});

test('audio player swipes need a clear direction and ignore short or diagonal gestures', () => {
  assert.equal(classifyPlayerSwipe(-PLAYER_SWIPE_THRESHOLD, 0), 'next');
  assert.equal(classifyPlayerSwipe(PLAYER_SWIPE_THRESHOLD, 0), 'previous');
  assert.equal(classifyPlayerSwipe(0, PLAYER_SWIPE_THRESHOLD), 'collapse');
  assert.equal(classifyPlayerSwipe(0, -PLAYER_SWIPE_THRESHOLD), 'expand');
  assert.equal(classifyPlayerSwipe(30, 30), null);
  assert.equal(classifyPlayerSwipe(PLAYER_SWIPE_THRESHOLD - 1, 0), null);
});
