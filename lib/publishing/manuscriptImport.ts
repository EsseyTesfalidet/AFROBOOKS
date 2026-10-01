import { decodeManuscriptBytes } from './manuscriptEncoding';
import type { PdfImportOptions } from './ocr';
import { lineJoiner } from '@/lib/utils/paragraphFlow';

export type ManuscriptLineBreaks = 'paragraphs' | 'preserve' | 'legacy';
export type ManuscriptImportOptions = PdfImportOptions & { lineBreaks?: Exclude<ManuscriptLineBreaks, 'legacy'> };

export interface ImportedChapterDraft {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  isPreview: boolean;
}

const CHAPTER_HEADING_PATTERN =
  /^(?:#{1,6}\s*)?(chapter|chap\.?|part|act|ምዕራፍ|الفصل|فصل)\s+([\p{L}\p{N}]+)(?:\s*[:.\-–—]\s*(.+))?$/iu;

const SECOND_LEVEL_HEADING_PATTERN = /^##+\s+(.+)$/;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineFormatting(value: string) {
  return value
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(.+?)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
}

function paragraphToHtml(paragraph: string, lineBreaks: ManuscriptLineBreaks) {
  const rawLines = paragraph.split('\n').filter(line => line.trim());
  const lines = paragraph
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return '';
  }

  if (lines.every((line) => /^[-*]\s+/.test(line))) {
    const items = lines
      .map((line) => line.replace(/^[-*]\s+/, ''))
      .map((line) => `<li>${applyInlineFormatting(escapeHtml(line))}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  }

  if (lineBreaks === 'legacy') return `<p>${applyInlineFormatting(escapeHtml(lines.join('\n'))).replace(/\n/g, '<br/>')}</p>`;
  if (lineBreaks === 'preserve') return `<p data-preserve-breaks="true">${applyInlineFormatting(escapeHtml(lines.join('\n'))).replace(/\n/g, '<br/>')}</p>`;
  if (lines.every(line => /^\d+[.)]\s+/.test(line))) {
    return `<ol start="${Number.parseInt(lines[0], 10)}">${lines.map(line => `<li>${applyInlineFormatting(escapeHtml(line.replace(/^\d+[.)]\s+/, '')))}</li>`).join('')}</ol>`;
  }
  let joined = '';
  let explicitBreak = false;
  for (const [index, line] of rawLines.entries()) {
    const hardBreak = /(?: {2,}|\\)$/.test(line);
    const value = (hardBreak ? line.replace(/(?: {2,}|\\)$/, '') : line).trim();
    joined += value;
    if (index < rawLines.length - 1) {
      joined += hardBreak ? '\n' : lineJoiner(value, rawLines[index + 1]);
      explicitBreak ||= hardBreak;
    }
  }
  return `<p${explicitBreak ? ' data-preserve-breaks="true"' : ''}>${applyInlineFormatting(escapeHtml(joined)).replace(/\n/g, '<br/>')}</p>`;
}

function sectionBodyToHtml(body: string, lineBreaks: ManuscriptLineBreaks) {
  return body
    .split(lineBreaks === 'legacy' ? /\n{2,}/ : /\n[\t ]*\n(?:[\t ]*\n)*/)
    .flatMap(paragraph => {
      if (lineBreaks !== 'paragraphs') return [paragraph];
      const groups: string[] = [];
      let previous = '';
      for (const line of paragraph.split('\n')) {
        const kind = /^\s*[-*]\s+/.test(line) ? 'bullet' : /^\s*\d+[.)]\s+/.test(line) ? 'numbered' : 'prose';
        if (kind === previous) groups[groups.length - 1] += '\n' + line;
        else { groups.push(line); previous = kind; }
      }
      return groups;
    })
    .map((paragraph) => paragraphToHtml(paragraph, lineBreaks))
    .filter(Boolean)
    .join('');
}

function countWords(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeChapterTitle(rawTitle: string, chapterNumber: number) {
  const title = rawTitle.trim();
  return title || `Chapter ${chapterNumber}`;
}

function deriveHeadingTitle(rawHeading: string, chapterNumber: number) {
  const chapterHeadingMatch = rawHeading.match(CHAPTER_HEADING_PATTERN);

  if (chapterHeadingMatch) {
    const [, sectionLabel, sectionNumber, sectionName] = chapterHeadingMatch;
    const cleanedLabel = sectionLabel.toLowerCase() === 'chap.' ? 'Chapter' : sectionLabel;
    const prettyLabel = cleanedLabel.charAt(0).toUpperCase() + cleanedLabel.slice(1).toLowerCase();
    return normalizeChapterTitle(
      sectionName ? `${prettyLabel} ${sectionNumber}: ${sectionName}` : `${prettyLabel} ${sectionNumber}`,
      chapterNumber
    );
  }

  const secondLevelHeadingMatch = rawHeading.match(SECOND_LEVEL_HEADING_PATTERN);
  if (secondLevelHeadingMatch) {
    return normalizeChapterTitle(secondLevelHeadingMatch[1], chapterNumber);
  }

  return normalizeChapterTitle(rawHeading.replace(/^#{1,6}\s*/, ''), chapterNumber);
}

interface SectionBuffer {
  heading: string;
  lines: string[];
}

function flushSection(sections: ImportedChapterDraft[], buffer: SectionBuffer | null, lineBreaks: ManuscriptLineBreaks) {
  if (!buffer) {
    return;
  }

  const body = buffer.lines.join('\n').trim();
  if (!body) {
    return;
  }

  const chapterNumber = sections.length + 1;
  const content = sectionBodyToHtml(body, lineBreaks);

  sections.push({
    chapterNumber,
    title: deriveHeadingTitle(buffer.heading, chapterNumber),
    content,
    wordCount: countWords(content),
    isPreview: chapterNumber === 1,
  });
}

export function extractSectionsFromText(text: string, lineBreaks: ManuscriptLineBreaks = 'paragraphs') {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split('\n');
  const sections: ImportedChapterDraft[] = [];
  let buffer: SectionBuffer | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const isChapterHeading =
      CHAPTER_HEADING_PATTERN.test(line) || SECOND_LEVEL_HEADING_PATTERN.test(line);

    if (isChapterHeading) {
      flushSection(sections, buffer, lineBreaks);
      buffer = { heading: line, lines: [] };
      continue;
    }

    if (!buffer) {
      buffer = { heading: 'Chapter 1', lines: [] };
    }

    buffer.lines.push(rawLine);
  }

  flushSection(sections, buffer, lineBreaks);

  if (sections.length > 0) {
    return sections;
  }

  const fallbackContent = sectionBodyToHtml(normalized, lineBreaks);

  return [
    {
      chapterNumber: 1,
      title: 'Chapter 1',
      content: fallbackContent,
      wordCount: countWords(fallbackContent),
      isPreview: true,
    },
  ];
}

export function validateManuscriptFile(file: File) {
  const fileName = file.name.toLowerCase();
  const pdf = fileName.endsWith('.pdf');
  const validExtension = pdf || fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.markdown');

  if (!validExtension) {
    throw new Error('Upload a .pdf, .txt or .md manuscript file.');
  }

  if (file.size > (pdf ? 20 : 5) * 1024 * 1024) {
    throw new Error(`The manuscript is too large. Use a file no larger than ${pdf ? 20 : 5} MB.`);
  }
}

export async function importManuscriptFile(file: File, onProgress?: (message: string) => void, options: ManuscriptImportOptions = {}) {
  validateManuscriptFile(file);

  const pdf = file.name.toLowerCase().endsWith('.pdf');
  if (options.mode === 'ocr' && !pdf) throw new Error('OCR accepts PDF files. Choose Text PDF / .txt / .md for this file.');
  const extracted = pdf ? await (await import('./pdfManuscript')).extractPdfManuscript(file, onProgress, options) : null;
  const rawText = extracted?.text ?? decodeManuscriptBytes(new Uint8Array(await file.arrayBuffer()));
  const chapters = extractSectionsFromText(rawText, options.lineBreaks ?? 'paragraphs');

  if (!chapters.length) {
    throw new Error('No readable manuscript content was found in the uploaded file.');
  }

  return {
    chapters,
    totalWords: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    fileName: file.name,
    warnings: extracted?.warnings ?? [],
    // Save the converted UTF-8 manuscript through the existing private text
    // storage path. The source PDF never needs to leave the author's browser.
    sourceFile: pdf ? new File([rawText], file.name.replace(/\.pdf$/i, '.txt'), { type: 'text/plain' }) : file,
  };
}
