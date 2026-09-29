import { test } from 'node:test';
import assert from 'node:assert/strict';
import { communityAction } from '../lib/community';
import { communityReturnPath, loginDestination } from '../lib/utils/loginDestination';

test('community login returns stay within supported pages for readers and authors', () => {
  for (const path of ['/community', '/community/new', '/community?tab=memory', `/community/${'a'.repeat(40)}`]) {
    assert.equal(communityReturnPath(path), path);
    assert.equal(loginDestination({ role: 'seller', activeRole: 'seller' }, path), path);
  }
  for (const path of ['//evil.test', 'https://evil.test', '/community/../admin', '/community/%2f%2fevil.test', '/community?redirect=evil', '/community\\evil', '/community/new#evil', '/community/new\n']) {
    assert.equal(communityReturnPath(path), null);
  }
});

test('community input rejects forged identities, markup-sized payloads and invalid document paths', () => {
  const reply = { action: 'reply', attemptId: 'b7c6df6f-9bc8-4b67-a39e-edfcde576012', postId: 'a'.repeat(40), body: 'A useful lead' };
  assert.equal(communityAction.safeParse(reply).success, true);
  for (const change of [{ authorId: 'admin' }, { role: 'admin' }, { body: ' '.repeat(30) }, { body: 'a'.repeat(3001) }, { postId: '../users/admin' }, { parentReplyId: 'wrong' }]) {
    assert.equal(communityAction.safeParse({ ...reply, ...change }).success, false);
  }
});
