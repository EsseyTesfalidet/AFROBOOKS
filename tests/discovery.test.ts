import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookSampleAllowed, bookSampleText, publicAudioSamplePath } from '../lib/seo/publicSamples';
import { matchesPublicCollection } from '../lib/seo/collections';
import { relatedReleases, releaseShareText } from '../lib/seo/discovery';
import type { DiscoveryItem } from '../lib/server/discoveryPages';

test('public book samples exclude drafts, deleted books, PDFs and unreleased preorders', () => {
  assert.equal(bookSampleAllowed({ status: 'live' }), true);
  for (const book of [{ status: 'draft' }, { status: 'removed' }, { status: 'live', deletionPending: true }, { status: 'live', contentFormat: 'pdf' }, { status: 'live', isPreorder: true }, { status: 'live', isPreorder: true, releaseDate: { toMillis: () => 101 } }]) assert.equal(bookSampleAllowed(book, 100), false);
  assert.equal(bookSampleAllowed({ status: 'live', isPreorder: true, releaseDate: { toMillis: () => 100 } }, 100), true);
});

test('public excerpts preserve Unicode and paragraphs, remove executable content and stay bounded', () => {
  assert.equal(bookSampleText('<p>ትግርኛ &amp; العربية</p><p>Second paragraph<br>More text</p><script>secret()</script>'), 'ትግርኛ & العربية\n\nSecond paragraph\nMore text');
  const excerpt = bookSampleText(`<p>${'📖'.repeat(3000)}</p>`);
  assert.equal(Array.from(excerpt).length, 2401);
  assert.equal(excerpt.endsWith('📖…'), true);
});

test('anonymous audio signing can select only a bounded, published sample asset', () => {
  const title = { id: 'recording', creatorId: 'creator', status: 'published', ready: true, previewReady: true, previewVersion: 'version', previewSeconds: 60 };
  assert.equal(publicAudioSamplePath(title), 'audio/creator/recording/preview-version.mp3');
  for (const fields of [{ status: 'draft' }, { status: 'removed' }, { ready: false }, { previewReady: false }, { previewVersion: '' }, { previewVersion: '../../playback' }, { creatorId: '../other' }, { id: 'other/part' }, { previewSeconds: 61 }, { previewSeconds: Infinity }, { previewSeconds: NaN }, { previewSeconds: 0 }, { previewSeconds: undefined }]) assert.equal(publicAudioSamplePath({ ...title, ...fields }), null);
});

test('curated pages match actual language/category metadata rather than titles or unrelated languages', () => {
  for (const language of ['Tigrinya', ' tigrigna ', 'Tigrina', 'ትግርኛ', 'ti', 'tir']) assert.equal(matchesPublicCollection('tigrinya-books', { language }), true);
  for (const language of ['Amharic', 'English', 'Tigre', '', undefined]) assert.equal(matchesPublicCollection('tigrinya-books', { language }), false);
  assert.equal(matchesPublicCollection('african-documentaries', { category: 'Documentaries' }), true);
  assert.equal(matchesPublicCollection('african-documentaries', { category: 'Films' }), false);
  assert.equal(matchesPublicCollection('invented-collection', { language: 'Tigrinya' }), false);
});

test('related releases prioritize language/subject without duplicate cards and share links retain Unicode', () => {
  const item = { id: 'one', kind: 'book', title: 'ታሪኽ', creator: 'An author', language: 'Tigrinya', category: 'History', href: '/african-books/one' } as DiscoveryItem;
  const other = (id: string, fields = {}) => ({ ...item, id, language: 'English', category: 'Fiction', ...fields });
  const candidates = [item, other('english'), other('subject', { category: 'History' }), other('language', { language: 'Tigrinya' }), other('language')];
  assert.deepEqual(relatedReleases(item, candidates).map(row => row.id), ['language', 'subject', 'english']);
  assert.equal(candidates.length, 5);
  assert.match(releaseShareText(item), /ታሪኽ by An author/);
  assert.match(releaseShareText(item), /https:\/\/afrobs.com\/african-books\/one$/);
  assert.doesNotMatch(releaseShareText(item), /free sample/i);
});
