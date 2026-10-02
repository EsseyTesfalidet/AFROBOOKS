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
import { sectionWordCount, splitReadingSections } from '../lib/publishing/readingSections';
import { cleanPdfPages, cleanPdfCharacters } from '../lib/publishing/pdfCleanup';

test('PDF cleanup removes corroborated margin page numbers and running titles in multiple scripts', () => {
  for (const numbers of [['1', '2', '3'], ['١', '٢', '٣'], ['۱', '۲', '۳'], ['፩', '፪', '፫'], ['i', 'ii', 'iii']]) {
    const pages = numbers.map(number => ({
      text: `ታሪክ ናይ ህይወት\n\nሰላም ዓለም።\nጽሑፍ ፣ ፤ ፦\nትግርኛ።\n\n${number}`,
      margins: { top: ['ታሪክ ናይ ህይወት'], bottom: [number] },
    }));
    const result = cleanPdfPages(pages);
    assert.equal(result.removedLines, 6);
    assert.equal(result.text, Array(3).fill('ሰላም ዓለም።\nጽሑፍ ፣ ፤ ፦\nትግርኛ።').join('\n\n'));
    assert.equal(cleanPdfPages(pages, false).text, pages.map(page => page.text).join('\n\n'));
  }
});

test('PDF cleanup protects body numbers, chapter headings, sparse pages, symbols, footnotes and poetry', () => {
  const pages = Array.from({ length: 3 }, () => ({
    text: 'ምዕራፍ ፩\n\n2026\n1. A numbered list\n¹ A footnote\n***\nH₂O + x² = 5\nمرحبا، بالعالم؟\n中文。\n። ፡ ፤ ፥ ፦ ፧ ፨',
    margins: { top: ['ምዕራፍ ፩'], bottom: [] },
  }));
  assert.equal(cleanPdfPages(pages).text, pages.map(p => p.text).join('\n\n'));
  assert.equal(cleanPdfPages([{ text: 'Chapter 1\n\n1', margins: { top: ['Chapter 1'], bottom: ['1'] } }]).removedLines, 0);
  // Repeated body prose near an OCR page edge without blank separation is kept.
  assert.equal(cleanPdfPages(Array(3).fill({ text: 'Refrain\nVerse one\nVerse two\nRefrain' })).removedLines, 0);
  assert.equal(cleanPdfCharacters('ሰላም። می\u200Cروم \u200Fعربي Café 🌍 ﬁne\u0000 co\u00AD\noperate'), 'ሰላም። می\u200Cروم \u200Fعربي Café 🌍 fine cooperate');
});

test('OCR cleanup requires isolated repeated page-edge artifacts and retains paragraph boundaries', () => {
  const pages = ['፩', '፪', '፫'].map(n => ({ text: `ታሪክ\n\nሰላም ዓለም።\nትግርኛ።\n\nካልኣይ ሕጡብ።\n\n${n}` }));
  const result = cleanPdfPages(pages);
  assert.equal(result.removedLines, 6);
  assert.match(result.text, /ትግርኛ።\n\nካልኣይ ሕጡብ።/);
  assert.equal(cleanPdfPages([{ text: 'Title\nBody\nBody again\nLast sentence\nPage 2', margins: { top: [], bottom: ['Page 2'] } }]).removedLines, 1);
});

test('physical PDF margins override object order without deleting matching body lines', () => {
  const pages = [1, 2, 3].map(n => ({ text: `First body line\nSecond body line\nThird body line\nRunning title\n${n}`, margins: { top: ['Running title'], bottom: [String(n)] } }));
  assert.equal(cleanPdfPages(pages).removedLines, 6);
  const ambiguous = pages.map(p => ({ ...p, text: `Running title\n${p.text}` }));
  assert.equal(cleanPdfPages(ambiguous).removedLines, 3);
  assert.equal(cleanPdfPages(ambiguous).text.match(/Running title/g)?.length, 6);
});

const sectionFixture = (content: string, isPreview = true) => ({ chapterNumber: 1, title: 'An author title', content, wordCount: sectionWordCount(content), isPreview });
const sectionParagraph = (index: number, size = 260) => `<p><strong>Paragraph ${index}</strong> ${'story '.repeat(size)}</p>`;

test('reading sections preserve every HTML block in order and limit free preview to the first part', () => {
  const content = Array.from({ length: 9 }, (_, index) => sectionParagraph(index)).join('\n');
  const parts = splitReadingSections(sectionFixture(content), 750);
  assert.equal(parts.length, 3);
  assert.equal(parts.map(part => part.content).join(''), content);
  assert.deepEqual(parts.map(part => part.chapterNumber), [1, 2, 3]);
  assert.deepEqual(parts.map(part => part.isPreview), [true, false, false]);
  assert.ok(parts.every(part => part.title.startsWith('Reading section ')));
  assert.equal(parts.reduce((sum, part) => sum + part.wordCount, 0), sectionWordCount(content));
  assert.ok(splitReadingSections(sectionFixture(content, false), 750).every(part => !part.isPreview));
});

test('headings stay with the following block and lists/verse are never cut inside', () => {
  const heading = '<h2>A section heading</h2>';
  const list = `<ul><li>${'first '.repeat(700)}</li><li>second item</li></ul>`;
  const verse = '<p data-preserve-breaks="true">A line<br/>Another line</p>';
  const content = sectionParagraph(1, 740) + heading + list + verse + sectionParagraph(2, 400);
  const parts = splitReadingSections(sectionFixture(content), 750);
  assert.equal(parts.map(part => part.content).join(''), content);
  assert.ok(parts.some(part => part.content.includes(heading + list)));
  assert.ok(parts.some(part => part.content.includes(verse)));
  assert.ok(parts.every(part => !part.content.endsWith(heading)));
});

test('short chapters and one giant paragraph stay intact; bad lengths and malformed HTML fail safely', () => {
  for (const content of ['<p>Short story.</p>', sectionParagraph(1, 4000)]) {
    const parts = splitReadingSections(sectionFixture(content), 750);
    assert.equal(parts.length, 1); assert.equal(parts[0].content, content); assert.equal(parts[0].title, 'An author title');
  }
  assert.throws(() => splitReadingSections(sectionFixture('<p>Text</p>'), Number.NaN), /section length/);
  assert.throws(() => splitReadingSections(sectionFixture('<p>one<p>two'), 750), /formatting/);
});

test('section word estimates support Tigrinya, Arabic and unspaced Chinese without losing text', () => {
  for (const phrase of ['ሰላም ዓለም። ', 'مرحبا بالعالم ', '中文故事']) {
    const content = Array.from({ length: 8 }, () => `<p>${phrase.repeat(220)}</p>`).join('');
    const parts = splitReadingSections(sectionFixture(content), 750);
    assert.ok(parts.length > 1); assert.equal(parts.map(part => part.content).join(''), content);
  }
});

test('heading-free uploads suggest sections, opt-out keeps one, and detected headings always win', async () => {
  const text = Array.from({ length: 9 }, (_, i) => `Paragraph ${i}. ${'story '.repeat(270)}`).join('\n\n');
  const automatic = await importManuscriptFile(new File([text], 'long.txt'), undefined, { sectionWords: 750 });
  assert.equal(automatic.chapters.length, 3); assert.match(automatic.warnings.join(' '), /No chapter headings/);
  const original = await importManuscriptFile(new File([text], 'long.txt'), undefined, { readingSections: 'off' });
  assert.equal(original.chapters.length, 1);
  assert.equal(automatic.chapters.map(chapter => chapter.content).join(''), original.chapters[0].content);
  const headed = await importManuscriptFile(new File(['ምዕራፍ ፩: ትግርኛ\n\n' + text], 'headed.txt'), undefined, { sectionWords: 750 });
  assert.equal(headed.chapters.length, 1); assert.equal(headed.chapters[0].title, 'ምዕራፍ ፩: ትግርኛ');
});

test('wrapped prose flows within paragraphs, retaining real blank paragraphs and inline formatting', async () => {
  const text = 'Chapter 1: Home\n\nThe river carried **stories\nacross generations** and people listened.\n  \nA separate paragraph\ncontinues here.';
  const result = await importManuscriptFile(new File([text], 'prose.md'));
  assert.equal(result.chapters[0].content, '<p>The river carried <strong>stories across generations</strong> and people listened.</p><p>A separate paragraph continues here.</p>');
});

test('authors can preserve verse; explicit Markdown breaks and adjacent lists stay distinct', async () => {
  const verse = 'Chapter 1: Song\n\nFirst line\nSecond line\n\nNext stanza';
  const result = await importManuscriptFile(new File([verse], 'verse.txt'), undefined, { lineBreaks: 'preserve' });
  assert.equal(result.chapters[0].content, '<p data-preserve-breaks="true">First line<br/>Second line</p><p data-preserve-breaks="true">Next stanza</p>');
  assert.equal(extractSectionsFromText('First line  \nSecond line\\\nThird line')[0].content, '<p data-preserve-breaks="true">First line<br/>Second line<br/>Third line</p>');
  assert.equal(extractSectionsFromText('Introduction\n- First\n- Second\nAfterwards\n3. Three\n4. Four')[0].content,
    '<p>Introduction</p><ul><li>First</li><li>Second</li></ul><p>Afterwards</p><ol start="3"><li>Three</li><li>Four</li></ol>');
});

test('paragraph flow preserves multilingual words and escapes imported HTML', () => {
  for (const [input, expected] of [['ሰላም\nዓለም።', 'ሰላም ዓለም።'], ['مرحبا\nبالعالم', 'مرحبا بالعالم'], ['中文\n故事', '中文故事'], ['well-\nknown', 'well-known']]) {
    assert.equal(extractSectionsFromText(input)[0].content, `<p>${expected}</p>`);
  }
  assert.equal(extractSectionsFromText('<script>alert(1)</script>\n& words')[0].content, '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; words</p>');
});

test('Unicode line separators flow and Unicode paragraph/blank-line separators remain distinct', async () => {
  const result = await importManuscriptFile(new File(['ምዕራፍ ፩: ትግርኛ\u2029ሰላም\u2028ዓለም።\u2029مرحبا\u0085بالعالم\n\u00a0\n中文\n故事。\n新的故事'], 'languages.txt'));
  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].title, 'ምዕራፍ ፩: ትግርኛ');
  assert.equal(result.chapters[0].content, '<p>ሰላም ዓለም።</p><p>مرحبا بالعالم</p><p>中文故事。新的故事</p>');
  assert.equal(extractSectionsFromText('ሰላም\u2028ዓለም።', 'preserve')[0].content, '<p data-preserve-breaks="true">ሰላም<br/>ዓለም።</p>');
  assert.equal(extractSectionsFromText('ሰላም\u2028ዓለም።', 'legacy')[0].content, '<p>ሰላም\u2028ዓለም።</p>');
});

test('legacy encoding repairs retain old line breaks instead of silently reformatting a book', () => {
  const bytes = Uint8Array.from([...new TextEncoder().encode('Chapter 1: Opening\n\nMero'), 0xeb, ...new TextEncoder().encode('\nhome.')]);
  const legacy = extractSectionsFromText(new TextDecoder().decode(bytes), 'legacy');
  const stored = legacy.map(chapter => ({ ...chapter, id: 'chapter' }));
  const patches = planManuscriptRepair(bytes, stored);
  assert.equal(patches[0].content, '<p>Meroë<br/>home.</p>');
  assert.deepEqual(planManuscriptRepair(bytes, [{ ...stored[0], ...patches[0] }]), []);
});

function pdfItem(str: string, x: number, y: number, width: number, hasEOL = false): TextItem {
  return { str, dir: 'ltr', width, height: 12, transform: [12, 0, 0, 12, x, y], fontName: 'fixture', hasEOL };
}

test('PDF regular wide line spacing is not mistaken for a paragraph break on every line', () => {
  const text = pdfTextItemsToText([
    pdfItem('A paragraph starts here', 30, 700, 160, true),
    pdfItem('and continues on the next line', 30, 676, 160, true),
    pdfItem('with more words for its readers', 30, 652, 160, true),
    pdfItem('before it ends.', 30, 628, 100, true),
    pdfItem('A new paragraph follows.', 30, 580, 160, true),
  ]);
  assert.equal(extractSectionsFromText(text)[0].content, '<p>A paragraph starts here and continues on the next line with more words for its readers before it ends.</p><p>A new paragraph follows.</p>');
});

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
