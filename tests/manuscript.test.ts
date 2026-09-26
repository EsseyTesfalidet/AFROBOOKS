import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeManuscriptBytes } from '../lib/publishing/manuscriptEncoding';
import { importManuscriptFile } from '../lib/publishing/manuscriptImport';
import { extractSectionsFromText } from '../lib/publishing/manuscriptImport';
import { planManuscriptRepair } from '../lib/server/manuscriptRepair';

test('UTF-8 manuscripts retain multilingual text, accents, punctuation and emoji', async () => {
  const text = 'Chapter 1: ታሪክ\n\n“Café”—العربية, 中文, Meroë… 🌍';
  const result = await importManuscriptFile(new File([text], 'story.md'));
  assert.equal(result.chapters[0].title, 'Chapter 1: ታሪክ');
  assert.equal(result.chapters[0].content, '<p>“Café”—العربية, 中文, Meroë… 🌍</p>');
  assert.equal(decodeManuscriptBytes(new TextEncoder().encode('\uFEFF' + text)), text);
});

test('Windows text restores curly quotes, dashes, ellipses and accented names before splitting chapters', async () => {
  const bytes = Uint8Array.from([
    ...new TextEncoder().encode('Chapter 1: Opening\n\n'),
    0x93, ...new TextEncoder().encode('Africa'), 0x92, 0x73, 0x94, 0x97,
    ...new TextEncoder().encode('Mero'), 0xeb, 0x85,
    ...new TextEncoder().encode('\n\nChapter 2: Home\n\n'), 0x80, 0x35,
  ]);
  const result = await importManuscriptFile(new File([bytes], 'windows.txt'));
  assert.equal(result.chapters.length, 2);
  assert.equal(result.chapters[0].content, '<p>“Africa’s”—Meroë…</p>');
  assert.equal(result.chapters[1].content, '<p>€5</p>');
  assert.deepEqual(result.chapters.map(chapter => chapter.isPreview), [true, false]);
});

test('Unicode text with either UTF-16 byte order imports without losing characters', async () => {
  const text = 'Chapter 1: Beginning\n\n“Hello”—ታሪክ 🌍';
  const little = Buffer.from('\uFEFF' + text, 'utf16le');
  const big = Buffer.from(little).swap16();
  for (const bytes of [little, big]) {
    assert.equal(decodeManuscriptBytes(bytes), text);
    const result = await importManuscriptFile(new File([new Uint8Array(bytes)], 'unicode.txt'));
    assert.equal(result.chapters[0].content, '<p>“Hello”—ታሪክ 🌍</p>');
  }
});

test('already damaged text, malformed marked Unicode, binary and undefined Windows bytes are rejected', async () => {
  for (const bytes of [
    new TextEncoder().encode('Already lost: \uFFFD'),
    Uint8Array.from([0xef, 0xbb, 0xbf, 0x93]),
    Uint8Array.from([0xff, 0xfe, 0x61]),
    Uint8Array.from([0x50, 0x4b, 0x00, 0x01]),
    Uint8Array.from([0x81]),
  ]) {
    await assert.rejects(importManuscriptFile(new File([bytes], 'damaged.txt')), /Export the original document as UTF-8/);
  }
});

test('repairs use the original bytes, preserve custom chapter titles, refuse edited content and are repeatable', () => {
  const bytes = Uint8Array.from([...new TextEncoder().encode('Chapter 1: Opening\n\nMero'), 0xeb, 0x97, ...new TextEncoder().encode('home.')]);
  const legacy = extractSectionsFromText(new TextDecoder().decode(bytes));
  const stored = legacy.map((chapter, index) => ({ ...chapter, id: String(index), title: 'Author’s custom title' }));
  const patches = planManuscriptRepair(bytes, stored);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].content, '<p>Meroë—home.</p>');
  assert.equal(patches[0].title, 'Author’s custom title');
  assert.deepEqual(planManuscriptRepair(bytes, [{ ...stored[0], ...patches[0] }]), []);
  assert.throws(() => planManuscriptRepair(bytes, [{ ...stored[0], content: '<p>Later editorial changes</p>' }]), /edited after import/);
  assert.throws(() => planManuscriptRepair(bytes, []), /chapter structure/);
});
