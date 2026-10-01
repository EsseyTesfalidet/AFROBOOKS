import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { abortable, createOcrWorker, type PdfImportOptions } from './ocr';

// Keep the PDF's text order; use baseline changes and larger gaps to recover
// lines and paragraphs. Complex columns still need an author's review.
export function pdfTextItemsToText(items: Array<TextItem | TextMarkedContent>) {
  // Learn regular line spacing: double-spaced PDFs can otherwise look like a
  // separate paragraph on every line. Sparse/ambiguous pages keep the fallback.
  const runs = items.filter((item): item is TextItem => 'str' in item && !!item.str.trim());
  const gaps: number[] = [];
  for (let index = 1; index < runs.length; index++) {
    const height = Math.max(Math.abs(runs[index - 1].height), Math.abs(runs[index].height), 1);
    const ratio = Math.abs(runs[index].transform[5] - runs[index - 1].transform[5]) / height;
    if (ratio > 0.5 && ratio <= 2.5) gaps.push(ratio);
  }
  gaps.sort((a, b) => a - b);
  const paragraphGap = gaps.length >= 3 ? Math.max(1.6, gaps[Math.floor((gaps.length - 1) / 4)] * 1.35) : 1.6;
  let text = '';
  let previous: TextItem | undefined;
  for (const item of items) {
    if (!('str' in item)) continue;
    const value = item.str.replace(/\u0000/g, '');
    if (previous && value) {
      const height = Math.max(Math.abs(previous.height), Math.abs(item.height), 1);
      const verticalGap = Math.abs(item.transform[5] - previous.transform[5]);
      if (verticalGap > height * 0.5) {
        text = text.trimEnd() + (verticalGap > height * paragraphGap ? '\n\n' : '\n');
      } else if (text && !/\s$/.test(text) && !/^\s/.test(value)) {
        const gap = item.dir === 'rtl' && previous.dir === 'rtl'
          ? previous.transform[4] - (item.transform[4] + item.width)
          : item.transform[4] - (previous.transform[4] + previous.width);
        if (gap > height * 0.15) text += ' ';
      }
    }
    text += value;
    if (item.hasEOL && !text.endsWith('\n')) text += '\n';
    if (value) previous = item;
  }
  return text.trim();
}

export async function extractPdfManuscript(file: File, onProgress?: (message: string) => void, options: PdfImportOptions = {}) {
  options.signal?.throwIfAborted();
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder('ascii').decode(data.subarray(0, 5)) !== '%PDF-') {
    throw new Error('This file is not a valid PDF. Export it as PDF again and retry.');
  }
  const library = await import('pdfjs-dist');
  library.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  const task = library.getDocument({ data, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/', stopAtErrors: true });
  const controller = new AbortController();
  const relay = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', relay, { once: true });
  if (options.signal?.aborted) relay();
  const abort = () => { void task.destroy(); };
  controller.signal.addEventListener('abort', abort, { once: true });
  const ocrMode = options.mode === 'ocr';
  let ocr: Awaited<ReturnType<typeof createOcrWorker>> | undefined;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, ocrMode ? 600_000 : 120_000);
  try {
    const document = await abortable(task.promise, controller.signal);
    const maxPages = ocrMode ? 50 : 500;
    if (document.numPages > maxPages) throw new Error(`Import up to ${maxPages} PDF pages at a time${ocrMode ? ' with OCR' : ''}. Split this PDF into smaller files.`);
    if (ocrMode) ocr = await createOcrWorker(options.language ?? 'eng', controller.signal, onProgress);
    const pages: string[] = [];
    const emptyPages: number[] = [];
    const uncertainPages: number[] = [];
    let characters = 0;
    for (let number = 1; number <= document.numPages; number++) {
      controller.signal.throwIfAborted();
      onProgress?.(`${ocrMode ? 'Recognizing scanned' : 'Reading PDF'} page ${number} of ${document.numPages}…`);
      const page = await abortable(document.getPage(number), controller.signal);
      let text: string;
      if (ocr) {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(3, 4096 / Math.max(base.width, base.height), Math.sqrt(4_000_000 / (base.width * base.height)));
        if (!Number.isFinite(scale) || scale <= 0) throw new Error('This PDF has invalid page dimensions.');
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        try {
          await abortable(page.render({ canvas, viewport, background: '#ffffff' }).promise, controller.signal);
          const result = await ocr.recognize(canvas);
          text = result.text;
          if (result.confidence < 60) uncertainPages.push(number);
        } finally { canvas.width = 0; canvas.height = 0; }
      } else {
        const content = await abortable(page.getTextContent(), controller.signal);
        text = pdfTextItemsToText(content.items);
      }
      characters += text.length;
      if (characters > 2_000_000) throw new Error('This PDF contains too much text for one import. Split it into smaller files.');
      if (!/[\p{L}\p{N}]/u.test(text)) emptyPages.push(number);
      pages.push(text);
      page.cleanup();
    }
    if (emptyPages.length === document.numPages) {
      throw new Error(ocrMode ? 'OCR did not recognize readable text. Choose the correct language and a clearer scan, or paste the text into the editor.' : 'No selectable text was found. This may be a scanned PDF. Run OCR by choosing Scanned PDF / OCR above, select its language, and upload it again.');
    }
    const text = pages.join('\n\n');
    if (text.includes('\uFFFD')) throw new Error('Some PDF characters could not be read correctly. Export a searchable PDF with embedded fonts, or upload a UTF-8 text file.');
    const warnings = ['Text only: pictures, tables, fonts and page layouts are not preserved. Check chapter breaks, reading order, headers and page numbers before publishing.'];
    if (ocrMode) warnings.unshift('OCR can misread letters, punctuation and chapter headings. Compare every chapter with the scan and correct mistakes before publishing.');
    if (uncertainPages.length) warnings.push(`OCR needs extra review on ${uncertainPages.length} page(s): ${uncertainPages.slice(0, 20).join(', ')}${uncertainPages.length > 20 ? ', …' : ''}.`);
    if (/[\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(text)) warnings.push('This PDF uses Arabic presentation glyphs. Letters or reading order may be incorrect. Compare the preview with the original; if it is incorrect, export a UTF-8 .txt or .md file from the original document instead.');
    if (emptyPages.length) warnings.push(`No text found on ${emptyPages.length} page(s): ${emptyPages.slice(0, 20).join(', ')}${emptyPages.length > 20 ? ', …' : ''}. These may be blank or scanned pages; check the original for missing content.`);
    return { text, warnings, pageCount: document.numPages };
  } catch (error) {
    if (timedOut) throw new Error('This PDF took too long to convert. Split it into smaller files and try again.');
    if (controller.signal.aborted) throw new DOMException('Import cancelled. Your existing chapters are unchanged.', 'AbortError');
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('This PDF is password protected. Upload an unlocked copy that you have permission to publish.');
    if (error instanceof Error && ['InvalidPDFException', 'UnknownErrorException'].includes(error.name)) throw new Error('The PDF could not be read. Export a new searchable PDF and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', relay);
    controller.signal.removeEventListener('abort', abort);
    await ocr?.close();
    await task.destroy();
  }
}
