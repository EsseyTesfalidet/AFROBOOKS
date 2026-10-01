// Wrapped CJK lines do not need an extra space between adjacent characters.
export function lineJoiner(left: string, right: string) {
  if (/[\p{L}\p{N}][-\u2010\u00ad]$/u.test(left.trimEnd()) && /^\p{L}/u.test(right.trimStart())) return '';
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}、。，！？「」『』（）]$/u.test(left.trimEnd()) &&
    /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}、。，！？「」『』（）]/u.test(right.trimStart()) ? '' : ' ';
}

export type TextFlow = 'auto' | 'paragraphs' | 'original';

// Count visible base characters, not UTF-16 units or combining vowel marks.
// Full-width East Asian characters occupy roughly twice the horizontal space.
function lineWidth(line: string) {
  let width = 0;
  for (const character of line.normalize('NFC')) {
    if (/[\p{M}\p{Cf}]/u.test(character)) continue;
    width += /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character) ? 2 : 1;
  }
  return width;
}

function looksWrapped(lines: string[]) {
  const widths = lines.map(lineWidth);
  const full = widths.slice(0, -1);
  if (widths.filter(width => width >= 55).length >= 2 && full.every(width => width >= 40)) return true;
  // Compact prose (including Ethiopic and Arabic) often wraps before 55 chars.
  // Require similarly sized full lines and evidence of a continuing sentence;
  // the final line may be short. Do not infer boundaries between paragraphs.
  const longest = full.reduce((maximum, width) => Math.max(maximum, width), 0);
  return longest >= 32 && full.every(width => width >= Math.max(24, longest * 0.65)) &&
    lines.at(-1)!.length > 0 &&
    lines.slice(0, -1).some(line => !/[.!?…。！？።፧؟।॥]["'”’»\)\]]*$/u.test(line));
}

/** Display-only reflow of sanitized HTML; never merge separate paragraph blocks. */
export function flowReaderParagraphs(html: string, mode: TextFlow = 'auto', poetry = false) {
  if (mode === 'original' || mode === 'auto' && poetry) return html;
  return html.replace(/<(p|pre)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (whole, tag: string, attributes: string, content: string) => {
    if (tag.toLowerCase() !== 'p' || mode === 'auto' && /data-preserve-breaks\s*=\s*["']true["']/i.test(attributes) || /<code\b/i.test(content)) return whole;
    // Multiple consecutive breaks are meaningful spacing, not a wrapped line.
    const groups = content.split(/((?:<br\s*\/?\s*>\s*){2,})/i);
    const flowed = groups.map((group, index) => {
      if (index % 2) return group;
      const lines = group.split(/<br\s*\/?\s*>/i);
      const plain = lines.map(line => line.replace(/<[^>]*>/g, '').trim());
      if (lines.length < 2 || plain.some(line => /^\s*(?:[-*•]|\p{N}+[.)።、])\s/u.test(line))) return group;
      // Ambiguous short verse, addresses and dialogue retain their original layout.
      if (mode === 'auto' && !looksWrapped(plain)) return group;
      return lines.reduce((joined, line, i) => i ? joined.trimEnd() + lineJoiner(plain[i - 1], plain[i]) + line.trimStart() : line, '');
    }).join('');
    return `<${tag}${attributes}>${flowed}</${tag}>`;
  });
}
