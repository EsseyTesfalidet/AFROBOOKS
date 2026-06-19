export interface ImportedChapterDraft {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  isPreview: boolean;
}

const CHAPTER_HEADING_PATTERN =
  /^(?:#{1,6}\s*)?(chapter|chap\.?|part|act)\s+([a-z0-9ivxlcdm]+)(?:\s*[:.\-–—]\s*(.+))?$/i;

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

function paragraphToHtml(paragraph: string) {
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

  return `<p>${applyInlineFormatting(escapeHtml(lines.join('\n'))).replace(/\n/g, '<br/>')}</p>`;
}

function sectionBodyToHtml(body: string) {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraphToHtml(paragraph.trim()))
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

function flushSection(sections: ImportedChapterDraft[], buffer: SectionBuffer | null) {
  if (!buffer) {
    return;
  }

  const body = buffer.lines.join('\n').trim();
  if (!body) {
    return;
  }

  const chapterNumber = sections.length + 1;
  const content = sectionBodyToHtml(body);

  sections.push({
    chapterNumber,
    title: deriveHeadingTitle(buffer.heading, chapterNumber),
    content,
    wordCount: countWords(content),
    isPreview: chapterNumber === 1,
  });
}

function extractSectionsFromText(text: string) {
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
      flushSection(sections, buffer);
      buffer = { heading: line, lines: [] };
      continue;
    }

    if (!buffer) {
      buffer = { heading: 'Chapter 1', lines: [] };
    }

    buffer.lines.push(rawLine);
  }

  flushSection(sections, buffer);

  if (sections.length > 0) {
    return sections;
  }

  const fallbackContent = sectionBodyToHtml(normalized);

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
  const validExtension = fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.markdown');

  if (!validExtension) {
    throw new Error('Upload a .txt or .md manuscript file.');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('The manuscript is too large. Use a file smaller than 5 MB.');
  }
}

export async function importManuscriptFile(file: File) {
  validateManuscriptFile(file);

  const rawText = await file.text();
  const chapters = extractSectionsFromText(rawText);

  if (!chapters.length) {
    throw new Error('No readable manuscript content was found in the uploaded file.');
  }

  return {
    chapters,
    totalWords: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    fileName: file.name,
  };
}
