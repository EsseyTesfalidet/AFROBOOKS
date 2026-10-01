import { parseDocument } from 'htmlparser2';

export interface SectionDraft {
  chapterNumber: number; title: string; content: string; wordCount: number; isPreview: boolean;
}
export const SECTION_LENGTHS = [750, 1500, 3000] as const;
type HtmlNode = ReturnType<typeof parseDocument>['children'][number];
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

function nodeText(node: HtmlNode): string {
  if (node.type === 'text') return node.data;
  if ('name' in node && ['script', 'style'].includes(node.name)) return '';
  if ('name' in node && node.name === 'br') return ' ';
  return 'children' in node ? node.children.map(nodeText).join('') + ('name' in node && /^(p|li|pre|blockquote|h[1-6])$/.test(node.name) ? ' ' : '') : '';
}
function words(text: string) {
  if (segmenter) {
    let count = 0;
    for (const part of segmenter.segment(text)) if (part.isWordLike) count++;
    return count;
  }
  return (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) ?? []).length;
}
export function sectionWordCount(html: string) { return words(parseDocument(html).children.map(nodeText).join('')); }

/** Split only between complete top-level blocks; concatenate results to recover the exact source. */
export function splitReadingSections(chapter: SectionDraft, targetWords = 1500): SectionDraft[] {
  if (!Number.isInteger(targetWords) || targetWords < 500 || targetWords > 5000) throw new Error('Choose a section length between 500 and 5,000 words.');
  const html = chapter.content;
  const nodes = parseDocument(html, { withStartIndices: true, withEndIndices: true }).children;
  const blocks: { html: string; words: number; heading: boolean }[] = [];
  let cursor = 0;
  for (const node of nodes) {
    const end = node.endIndex;
    if (node.startIndex === null || end === null || node.startIndex < cursor || end < node.startIndex) {
      throw new Error('This text has incomplete formatting. Open the chapter editor and save it before splitting.');
    }
    const content = html.slice(cursor, end + 1);
    const count = words(nodeText(node));
    if (!count && blocks.length) blocks[blocks.length - 1].html += content;
    else blocks.push({ html: content, words: count, heading: 'name' in node && /^h[1-6]$/.test(node.name) });
    cursor = end + 1;
  }
  if (cursor < html.length && blocks.length) blocks[blocks.length - 1].html += html.slice(cursor);
  if (!blocks.length) return [chapter];
  const parts: { content: string; wordCount: number }[] = [];
  let content = ''; let wordCount = 0; let heading = false;
  for (const block of blocks) {
    if (wordCount >= targetWords && !heading && block.words) {
      parts.push({ content, wordCount }); content = ''; wordCount = 0;
    }
    content += block.html; wordCount += block.words;
    if (block.words) heading = block.heading;
  }
  if (content) parts.push({ content, wordCount });
  // Avoid a tiny final section without cutting sentences or paragraphs.
  if (parts.length > 1 && parts.at(-1)!.wordCount < targetWords / 4) {
    const tail = parts.pop()!; parts.at(-1)!.content += tail.content; parts.at(-1)!.wordCount += tail.wordCount;
  }
  if (parts.length > 200) throw new Error('This would create more than 200 sections. Choose a longer section length or import a smaller manuscript.');
  if (parts.length < 2) return [{ ...chapter, wordCount: parts[0]?.wordCount ?? chapter.wordCount }];
  if (parts.map(part => part.content).join('') !== html) throw new Error('The section preview could not preserve all text. Your chapter was not changed.');
  return parts.map((part, index) => ({ ...part, chapterNumber: index + 1, title: `Reading section ${index + 1}`, isPreview: chapter.isPreview === true && index === 0 }));
}
