import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateReadingProgress } from '../lib/utils/readingProgress';
import { sanitizeChapter } from '../lib/utils/sanitizeChapter';

test('finishing an early chapter does not finish the book', () => {
  assert.deepEqual(calculateReadingProgress(0, 10, 100, true), { percentComplete: 10, isFinished: false });
  assert.equal(calculateReadingProgress(9, 10, 96, true).isFinished, true);
  assert.equal(calculateReadingProgress(0, 1, 100, false).isFinished, false);
});

test('chapter HTML preserves formatting and removes executable content', () => {
  const clean = sanitizeChapter('<h2>Title</h2><p><strong>Story</strong><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)" onclick="alert(4)">link</a><svg onload="alert(5)"></svg><iframe src="https://evil.test"></iframe></p>');
  assert.ok(clean.includes('<strong>Story</strong>'));
  assert.ok(clean.includes('<h2>Title</h2>'));
  assert.doesNotMatch(clean, /script|onerror|onclick|javascript|svg|iframe|alert/);
  assert.equal(sanitizeChapter('<a href="https://example.com">safe</a>'), '<a href="https://example.com">safe</a>');
  assert.doesNotMatch(sanitizeChapter('<a href="java&#x73;cript:alert(1)">x</a>'), /href/);
});
