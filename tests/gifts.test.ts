import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giftCheckoutSchema, giftTokenSchema } from '../lib/gifts';
import { checkGiftRecipient, giftAttemptId, giftPreview, giftTokenHash } from '../lib/server/bookGifts';
import { bookGiftEmail, giftClaimUrl, giftEmailConfiguration } from '../lib/server/giftEmail';
import { giftReturnPath, loginDestination } from '../lib/utils/loginDestination';

test('gift checkout normalizes recipient addresses and rejects oversized or invalid inputs', () => {
  const input = { recipientEmail: ' Friend@Example.com ', message: ' Enjoy! ', attemptId: 'e85c20fc-031a-43ba-a289-383c25ae1823' };
  assert.deepEqual(giftCheckoutSchema.parse(input), { ...input, recipientEmail: 'friend@example.com', message: 'Enjoy!' });
  for (const change of [{ recipientEmail: 'invalid' }, { message: 'x'.repeat(1001) }, { attemptId: 'reuse' }]) assert.equal(giftCheckoutSchema.safeParse({ ...input, ...change }).success, false);
  assert.equal(giftTokenSchema.safeParse('a'.repeat(64)).success, true);
  assert.equal(giftTokenSchema.safeParse('../private').success, false);
  assert.notEqual(giftTokenHash('secret'), 'secret');
  assert.notEqual(giftAttemptId('reader', input.attemptId), giftAttemptId('other', input.attemptId));
});

test('gift identity requires the exact verified recipient and hides details otherwise', () => {
  const gift = { status: 'available', recipientEmail: 'friend@example.com', bookId: 'book', bookTitle: 'Story', senderName: 'Alex', message: 'Enjoy' };
  assert.throws(() => checkGiftRecipient(gift, { uid: 'other', email: 'other@example.com', emailVerified: true }), /Sign in/);
  assert.throws(() => checkGiftRecipient(gift, { uid: 'friend', email: 'friend@example.com', emailVerified: false }), /Verify/);
  const recipient = { uid: 'friend', email: 'FRIEND@example.com', emailVerified: true };
  assert.equal(giftPreview(gift, recipient).claimed, false);
  assert.throws(() => giftPreview({ ...gift, status: 'claimed', recipientId: 'old-account' }, recipient), /not available/);
  for (const status of ['pending', 'needs_review']) assert.throws(() => giftPreview({ ...gift, status }, recipient), /not available/);
});

test('gift email escapes personal content and keeps the claim secret out of URL queries', () => {
  const url = giftClaimUrl('https://example.test', 'a'.repeat(64));
  assert.equal(new URL(url).search, '');
  assert.equal(new URL(url).hash, `#token=${'a'.repeat(64)}`);
  const email = bookGiftEmail({ from: 'sender@example.test', to: 'friend@example.test', senderName: '<script>bad</script>', bookTitle: 'A & B', message: '<img src=x onerror=bad>\nHello', url });
  assert.ok(!email.html.includes('<script>'));
  assert.ok(!email.html.includes('<img'));
  assert.ok(email.html.includes('A &amp; B'));
  assert.ok(email.text.includes('Hello'));
  assert.ok(email.html.includes('There is no charge'));
  assert.equal(giftEmailConfiguration({ NEXT_PUBLIC_APP_URL: 'http://example.test', RESEND_API_KEY: 'test' }), null);
  assert.equal(giftEmailConfiguration({ NEXT_PUBLIC_APP_URL: 'https://user:pass@example.test', RESEND_API_KEY: 'test' }), null);
  assert.equal(giftEmailConfiguration({ NEXT_PUBLIC_APP_URL: 'https://example.test' }), null);
});

test('gift sign-in destinations allow only known local paths, including a private checkout resume', () => {
  for (const path of ['/gifts', '/gifts/claim', '/gift/book', `/gift/book?resume=${'a'.repeat(64)}`]) {
    assert.equal(giftReturnPath(path), path);
    assert.equal(loginDestination({ role: 'buyer', activeRole: 'buyer' }, path), path);
  }
  for (const path of ['https://evil.test', '//evil.test', '/gift/../admin', '/gift/%2f%2fevil.test', '/gifts?next=evil', '/gift/book?resume=bad', '/gift/book\\evil']) assert.equal(giftReturnPath(path), null);
});
