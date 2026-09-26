import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateReadingProgress } from '../lib/utils/readingProgress';
import { sanitizeChapter } from '../lib/utils/sanitizeChapter';
import { localReaderPosition, newestReaderPosition, retainReaderPositions, storeReaderPosition, type ReaderPosition } from '../lib/utils/readerPosition';
import type { ReadingProgress } from '../types/order';

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

test('an unsynced device position wins over older cloud progress; a newer device can resume from the cloud', () => {
  const local: ReaderPosition = { currentChapter: 3, scrollPosition: 200, scrollFraction: .4, positionAnchor: { block: 8, fraction: .3 }, positionUpdatedAt: 2000 };
  const remote = { currentChapter: 1, positionUpdatedAt: 1000 } as ReadingProgress;
  assert.equal(newestReaderPosition(local, remote), local);
  const newer = { ...remote, currentChapter: 5, positionUpdatedAt: 3000 };
  assert.equal(newestReaderPosition(local, newer), newer);
  const legacy = { currentChapter: 2, lastReadAt: { toMillis: () => 3000 } } as ReadingProgress;
  assert.equal(newestReaderPosition(local, legacy), legacy);
  assert.equal(newestReaderPosition(local, null), local);
});

test('reading positions stay separate for previews and accounts, and deleted books leave the device cache', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  try {
    const position: ReaderPosition = { currentChapter: 3, scrollPosition: 200, scrollFraction: .4, positionAnchor: { block: 8, fraction: .3 }, positionUpdatedAt: 2000 };
    assert.equal(storeReaderPosition('kept', 'reader', true, position), true);
    storeReaderPosition('kept', 'reader', false, { ...position, currentChapter: 1 });
    storeReaderPosition('kept', 'another-reader', true, { ...position, currentChapter: 5 });
    storeReaderPosition('removed', null, false, position);
    assert.equal(localReaderPosition('kept', 'reader', true)?.currentChapter, 3);
    assert.equal(localReaderPosition('kept', 'reader', false)?.currentChapter, 1);
    assert.equal(localReaderPosition('kept', 'another-reader', true)?.currentChapter, 5);
    assert.equal(localReaderPosition('kept', null, true), null);
    retainReaderPositions(['kept']);
    assert.equal(localReaderPosition('removed', null, false), null);
    assert.equal(localReaderPosition('kept', 'reader', true)?.currentChapter, 3);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Storage disabled'); } });
    assert.equal(localReaderPosition('kept', 'reader', true), null);
    assert.equal(storeReaderPosition('kept', 'reader', true, position), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
