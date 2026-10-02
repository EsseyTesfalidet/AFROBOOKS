export interface PdfTextPage {
  text: string;
  // Selectable PDFs supply only text physically inside the page margins.
  // OCR has no reliable positions; use isolated edge lines more conservatively.
  margins?: { top: string[]; bottom: string[] };
}

export function cleanPdfCharacters(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u0085\u2028]/g, '\n').replace(/\u2029/g, '\n\n')
    // Do not strip Unicode format characters wholesale: joining controls and
    // direction marks are significant in Arabic and several other scripts.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF]/g, '')
    .replace(/\u00AD[^\S\n]*\n[^\S\n]*/g, '').replace(/\u00AD/g, '')
    // Only Latin typography ligatures, never broad NFKC conversion of a book.
    .replace(/[\uFB00-\uFB06]/g, c => ({ 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' })[c]!);
}

function numeral(value: string): number | null {
  const decimal = value.replace(/[٠-٩۰-۹०-९০-৯０-９]/g, c => {
    const point = c.codePointAt(0)!;
    const start = [0x660, 0x6f0, 0x966, 0x9e6, 0xff10].find(n => point >= n && point <= n + 9)!;
    return String(point - start);
  });
  if (/^\d{1,5}$/.test(decimal)) return Number(decimal);
  if (/^[፩-፼]+$/.test(value)) {
    let total = 0, group = 0;
    for (const c of value) {
      const n = c.codePointAt(0)!;
      if (n <= 0x1371) group += n - 0x1368;
      else if (n <= 0x137a) group += (n - 0x1371) * 10;
      else if (n === 0x137b) group = (group || 1) * 100;
      else { total += (group || 1) * 10000; group = 0; }
    }
    return total + group;
  }
  if (!value || !/^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i.test(value)) return null;
  const digits: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const parts = [...value.toLowerCase()].map(c => digits[c]);
  return parts.reduce((sum, n, i) => sum + (n < (parts[i + 1] ?? 0) ? -n : n), 0);
}

function pagination(line: string) {
  const match = line.match(/^(?:(page|p\.|ገጽ|صفحة)\s*)?[-–—·|\s]*([\p{N}ivxlcdm]+)(?:\s*(?:of|\/)\s*([\p{N}ivxlcdm]+))?[-–—·|\s]*$/iu);
  if (!match) return null;
  const value = numeral(match[2]);
  return value === null ? null : { value, explicit: !!(match[1] || match[3]) };
}

const chapter = /^(?:#{1,6}\s*)?(?:chapter|chap\.?|part|act|ምዕራፍ|الفصل|فصل)(?:\s|$)/iu;
const keyOf = (line: string) => line.trim().replace(/\s+/g, ' ');

/** Remove only corroborated margin artifacts; preserve all body text verbatim. */
export function cleanPdfPages(pages: PdfTextPage[], enabled = true) {
  if (!enabled) return { text: pages.map(p => p.text).join('\n\n'), removedLines: 0 };
  const lines = pages.map(p => cleanPdfCharacters(p.text).split('\n'));
  const candidates: { page: number; index: number; side: 'top' | 'bottom'; key: string; number: ReturnType<typeof pagination> }[] = [];
  for (const [page, rows] of lines.entries()) {
    const nonempty = rows.map((line, index) => line.trim() ? index : -1).filter(i => i >= 0);
    // Sparse pages may be a title, a dedication, poetry, or a chapter number.
    if (nonempty.length < 4) continue;
    for (const side of ['top', 'bottom'] as const) {
      const margins = pages[page].margins?.[side].map(line => keyOf(cleanPdfCharacters(line)));
      // Positioned headers can occur last in a PDF's internal object order.
      // Match the physical margin text anywhere, but leave ambiguous duplicates.
      const edges = margins ? nonempty : side === 'top' ? nonempty.slice(0, 3) : nonempty.slice(-3);
      for (const index of edges) {
        const key = keyOf(rows[index]);
        if (!key || key.length > 120 || chapter.test(key)) continue;
        if (margins ? !margins.includes(key) : !((side === 'top' ? index === nonempty[0] && !rows[index + 1]?.trim() : index === nonempty.at(-1) && !rows[index - 1]?.trim()))) continue;
        if (margins && nonempty.filter(i => keyOf(rows[i]) === key).length !== 1) continue;
        candidates.push({ page, index, side, key, number: pagination(key) });
      }
    }
  }
  const removed = new Set<string>();
  for (const candidate of candidates) {
    const matches = candidates.filter(other => other.side === candidate.side && (candidate.number
      ? other.number && other.number.value - other.page === candidate.number.value - candidate.page
      : !other.number && other.key === candidate.key));
    const count = new Set(matches.map(c => c.page)).size;
    const threshold = candidate.number ? 3 : Math.max(3, Math.ceil(pages.length * 0.4));
    if (candidate.number?.explicit || count >= threshold) removed.add(`${candidate.page}:${candidate.index}`);
  }
  return {
    text: lines.map((rows, page) => rows.filter((_, index) => !removed.has(`${page}:${index}`)).join('\n').replace(/\n{3,}/g, '\n\n').trim()).join('\n\n'),
    removedLines: removed.size,
  };
}
