import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeManuscriptBytes } from '../lib/publishing/manuscriptEncoding';
import { importManuscriptFile } from '../lib/publishing/manuscriptImport';
import { extractSectionsFromText } from '../lib/publishing/manuscriptImport';
import { planManuscriptRepair } from '../lib/server/manuscriptRepair';
import { pdfTextItemsToText } from '../lib/publishing/pdfManuscript';
import { validateManuscriptFile } from '../lib/publishing/manuscriptImport';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { abortable, createOcrWorker, OCR_LANGUAGES, type OcrLanguage } from '../lib/publishing/ocr';

function pdfItem(str: string, x: number, y: number, width: number, hasEOL = false): TextItem {
  return { str, dir: 'ltr', width, height: 12, transform: [12, 0, 0, 12, x, y], fontName: 'fixture', hasEOL };
}

test('PDF text recovers word gaps, paragraphs and chapter headings without executing markup', () => {
  const text = pdfTextItemsToText([
    pdfItem('Chapter 1: Opening', 30, 700, 120, true),
    pdfItem('Hello', 30, 670, 30), pdfItem('world.', 64, 670, 38, true),
    pdfItem('<script>alert(1)</script>', 30, 640, 150, true),
    pdfItem('Chapter 2: Home', 30, 600, 120, true),
    pdfItem('Second chapter.', 30, 570, 100, true),
  ]);
  const chapters = extractSectionsFromText(text);
  assert.equal(chapters.length, 2);
  assert.match(chapters[0].content, /Hello world\./);
  assert.match(chapters[0].content, /&lt;script&gt;/);
  assert.ok(!chapters[0].content.includes('<script>'));
  assert.equal(chapters[1].title, 'Chapter 2: Home');
  assert.deepEqual(chapters.map(chapter => chapter.isPreview), [true, false]);
});

test('PDF runs preserve multilingual text and do not insert spaces inside adjacent fragments', () => {
  const text = pdfTextItemsToText([pdfItem('Afro', 30, 700, 24), pdfItem('Books', 54, 700, 36), pdfItem('ታሪክ 中文', 94, 700, 90)]);
  assert.equal(text, 'AfroBooks ታሪክ 中文');
});

test('PDF uploads enforce limits and reject renamed non-PDF files before parsing', async () => {
  assert.throws(() => validateManuscriptFile({ name: 'large.pdf', size: 20 * 1024 * 1024 + 1 } as File), /20 MB/);
  assert.throws(() => validateManuscriptFile({ name: 'large.txt', size: 5 * 1024 * 1024 + 1 } as File), /5 MB/);
  assert.throws(() => validateManuscriptFile(new File(['text'], 'story.docx')), /\.pdf, \.txt or \.md/);
  await assert.rejects(importManuscriptFile(new File(['not a PDF'], 'story.PDF')), /not a valid PDF/);
});

test('Tigrinya and Arabic headings split chapters while preserving Ethiopic numerals and original text', async () => {
  const text = 'ምዕራፍ ፩: ትግርኛ\n\nሰላም ዓለም።\n\nምዕራፍ ፪: አማርኛ\n\nየአማርኛ ጽሑፍ።\n\nالفصل ٣: العربية\n\nمرحبا بالعالم';
  const result = await importManuscriptFile(new File([text], 'languages.txt', { type: 'text/plain' }));
  assert.equal(result.chapters.length, 3);
  assert.equal(result.chapters[0].title, 'ምዕራፍ ፩: ትግርኛ');
  assert.equal(result.chapters[0].content, '<p>ሰላም ዓለም።</p>');
  assert.equal(result.chapters[2].title, 'الفصل ٣: العربية');
  assert.equal(result.chapters[2].content, '<p>مرحبا بالعالم</p>');
});

test('right-to-left PDF fragments retain complete words and real word spaces', () => {
  const rtl = (str: string, x: number, width: number) => ({ ...pdfItem(str, x, 700, width), dir: 'rtl' });
  assert.equal(pdfTextItemsToText([rtl('مر', 150, 12), rtl('حبا', 132, 18), rtl('بالعالم', 90, 36)]), 'مرحبا بالعالم');
});

test('OCR supports Tigrinya explicitly and rejects unsupported models and non-PDF uploads', async () => {
  assert.ok(OCR_LANGUAGES.some(item => item.code === 'tir' && item.label === 'Tigrinya'));
  await assert.rejects(createOcrWorker('../unknown' as OcrLanguage, new AbortController().signal), /supported OCR language/);
  await assert.rejects(importManuscriptFile(new File(['text'], 'story.txt'), undefined, { mode: 'ocr', language: 'tir' }), /OCR accepts PDF/);
});

test('cancelling OCR interrupts waiting without accepting a late result', async () => {
  const controller = new AbortController();
  let finish!: (value: string) => void;
  const waiting = abortable(new Promise<string>(resolve => { finish = resolve; }), controller.signal);
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  finish('late text');
  await assert.rejects(abortable(Promise.resolve('text'), controller.signal), { name: 'AbortError' });
  assert.equal(await abortable(Promise.resolve('complete'), new AbortController().signal), 'complete');
});

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
