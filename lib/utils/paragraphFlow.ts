// Wrapped CJK lines do not need an extra space between adjacent characters.
export function lineJoiner(left: string, right: string) {
  if (/[\p{L}\p{N}][-\u2010\u00ad]$/u.test(left.trimEnd()) && /^\p{L}/u.test(right.trimStart())) return '';
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(left.trimEnd()) &&
    /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(right.trimStart()) ? '' : ' ';
}

export type TextFlow = 'auto' | 'paragraphs' | 'original';

/** Display-only reflow of sanitized HTML; never merge separate paragraph blocks. */
export function flowReaderParagraphs(html: string, mode: TextFlow = 'auto', poetry = false) {
  if (mode === 'original' || mode === 'auto' && poetry) return html;
  return html.replace(/<(p|pre)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (whole, tag: string, attributes: string, content: string) => {
    if (tag.toLowerCase() !== 'p' || /data-preserve-breaks\s*=\s*["']true["']/i.test(attributes) || /<code\b/i.test(content)) return whole;
    // Multiple consecutive breaks are meaningful spacing, not a wrapped line.
    const groups = content.split(/((?:<br\s*\/?\s*>\s*){2,})/i);
    const flowed = groups.map((group, index) => {
      if (index % 2) return group;
      const lines = group.split(/<br\s*\/?\s*>/i);
      const plain = lines.map(line => line.replace(/<[^>]*>/g, '').trim());
      if (lines.length < 2 || plain.some(line => /^\s*(?:[-*•]|\d+[.)])\s/.test(line))) return group;
      // Ambiguous short verse, addresses and dialogue retain their original layout.
      if (mode === 'auto' && (plain.filter(line => line.length >= 55).length < 2 || plain.slice(0, -1).some(line => line.length < 40))) return group;
      return lines.reduce((joined, line, i) => i ? joined.trimEnd() + lineJoiner(plain[i - 1], plain[i]) + line.trimStart() : line, '');
    }).join('');
    return `<${tag}${attributes}>${flowed}</${tag}>`;
  });
}
