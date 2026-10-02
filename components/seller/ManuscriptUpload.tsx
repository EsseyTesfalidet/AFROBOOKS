'use client';

import { useEffect, useRef, useState } from 'react';
import { importManuscriptFile } from '@/lib/publishing/manuscriptImport';
import { OCR_LANGUAGES, type OcrLanguage } from '@/lib/publishing/ocr';
import { SECTION_LENGTHS } from '@/lib/publishing/readingSections';

type ImportedManuscript = Awaited<ReturnType<typeof importManuscriptFile>>;

export default function ManuscriptUpload({ chapterCount, fileName, language = 'English', onImport, onBusy }: {
  chapterCount: number;
  fileName: string;
  language?: string;
  onImport: (result: ImportedManuscript) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ImportedManuscript | null>(null);
  const [mode, setMode] = useState<'text' | 'ocr'>('text');
  const [lineBreaks, setLineBreaks] = useState<'paragraphs' | 'preserve'>('paragraphs');
  const [cleanPdf, setCleanPdf] = useState(true);
  const [readingSections, setReadingSections] = useState<'auto' | 'off'>('auto');
  const [sectionWords, setSectionWords] = useState(1500);
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>(() => OCR_LANGUAGES.find(item => item.label === language || (language === 'Chinese' && item.code === 'chi_sim'))?.code ?? 'eng');
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); onBusy(false); }; }, [onBusy]);

  async function select(file?: File) {
    if (!file || busy) return;
    setBusy(true); onBusy(true); setError(''); setPending(null); setProgress('Reading manuscript…');
    controller.current = new AbortController();
    try {
      const result = await importManuscriptFile(file, message => { if (active.current) setProgress(message); }, { mode, cleanPdf, lineBreaks, readingSections, sectionWords, language: ocrLanguage, signal: controller.current.signal });
      if (active.current) setPending(result);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error && cause.name === 'AbortError' ? 'Import cancelled. Your existing chapters are unchanged.' : cause instanceof Error ? cause.message : 'This manuscript could not be read.');
    } finally {
      if (active.current) { setBusy(false); onBusy(false); }
    }
  }

  return <div className="space-y-3 rounded-xl border border-[#2a2a2a] bg-[#161616] p-4">
    <p className="text-sm font-medium text-white">Upload full book manuscript</p>
    <p className="text-xs leading-relaxed text-[#aaa]">Upload a PDF with selectable text (up to 20 MB / 500 pages), or a .txt / .md file (up to 5 MB). PDF text becomes editable chapters. For scanned pages, choose OCR below. Images and page designs are not imported.</p>
    <p className="text-xs leading-relaxed text-[#aaa]">Headings such as Chapter 1: Opening, ምዕራፍ 1 or الفصل 1 split chapters automatically. Without headings, long manuscripts can be divided into reading sections at paragraph boundaries. Review and edit the result before publishing.</p>
    <p className="text-xs leading-relaxed text-[#aaa]">Multilingual text is supported, including Tigrinya (ትግርኛ), Amharic, Arabic and Chinese, when the PDF stores readable characters. Check the preview for missing letters or incorrect reading order. Conversion keeps the original language.</p>
    <label className="block text-sm text-[#ddd]">Import method<select aria-label="Import method" value={mode} disabled={busy} onChange={event => { setMode(event.target.value as 'text' | 'ocr'); setPending(null); setError(''); }} className="mt-2 min-h-11 w-full rounded-lg border border-[#555] bg-[#222] px-3 text-white"><option value="text">Text PDF / .txt / .md</option><option value="ocr">Scanned PDF / OCR</option></select></label>
    <label className="block text-sm text-[#ddd]">Text layout<select aria-label="Manuscript text layout" value={lineBreaks} disabled={busy} onChange={event => { setLineBreaks(event.target.value as 'paragraphs' | 'preserve'); setPending(null); }} className="mt-2 min-h-11 w-full rounded-lg border border-[#555] bg-[#222] px-3 text-white"><option value="paragraphs">Flow as paragraphs</option><option value="preserve">Keep original lines (poetry / verse)</option></select></label>
    <p className="text-xs leading-relaxed text-[#aaa]">Paragraphs join wrapped lines and keep blank lines as paragraph breaks. Choose original lines when each line ending is intentional.</p>
    <label className="flex items-start gap-3 text-sm text-[#ddd]"><input type="checkbox" checked={cleanPdf} disabled={busy} onChange={event => { setCleanPdf(event.target.checked); setPending(null); }} className="mt-1 h-5 w-5 shrink-0 accent-[#e8442a]" /><span>Clean PDF text<span className="mt-1 block text-xs leading-relaxed text-[#aaa]">Remove likely page numbers, repeated page headers and hidden control characters. Keep language-specific letters and punctuation. Applies to text PDFs and OCR; review before accepting.</span></span></label>
    <label className="block text-sm text-[#ddd]">When no chapter headings are found<select aria-label="Manuscript chapter organization" value={readingSections} disabled={busy} onChange={event => { setReadingSections(event.target.value as 'auto' | 'off'); setPending(null); }} className="mt-2 min-h-11 w-full rounded-lg border border-[#555] bg-[#222] px-3 text-white"><option value="auto">Suggest reading sections</option><option value="off">Keep one section</option></select></label>
    {readingSections === 'auto' && <label className="block text-sm text-[#ddd]">Approximate section length<select aria-label="Import section length" value={sectionWords} disabled={busy} onChange={event => { setSectionWords(Number(event.target.value)); setPending(null); }} className="mt-2 min-h-11 w-full rounded-lg border border-[#555] bg-[#222] px-3 text-white">{SECTION_LENGTHS.map(size => <option key={size} value={size}>{size.toLocaleString()} words</option>)}</select></label>}
    {mode === 'ocr' && <div className="space-y-3">
      <label className="block text-sm text-[#ddd]">Language in the scan<select aria-label="OCR language" value={ocrLanguage} disabled={busy} onChange={event => setOcrLanguage(event.target.value as OcrLanguage)} className="mt-2 min-h-11 w-full rounded-lg border border-[#555] bg-[#222] px-3 text-white">{OCR_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}{item.code === 'tir' ? ' (ትግርኛ)' : ''}</option>)}</select></label>
      <p className="text-xs leading-relaxed text-[#ccc]">OCR reads words from scanned pages on your device. Use clear, upright printed pages in the selected language, up to 20 MB / 50 pages. Keep this tab open; recognition may take several minutes and downloads language tools on first use. Review the result for mistakes. Handwriting and mixed-language pages may need manual correction.</p>
    </div>}
    <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-[#e8442a] px-4 py-2.5 text-sm font-medium text-white">
      <input aria-label="Upload manuscript" type="file" accept={mode === 'ocr' ? '.pdf,application/pdf' : '.pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown'} disabled={busy} className="hidden" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void select(file); }} />
      {busy ? 'Importing…' : 'Upload manuscript'}
    </label>
    {busy && <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-xs text-[#ccc]">{progress}</p><button type="button" onClick={() => controller.current?.abort()} className="min-h-11 px-3 text-sm text-[#ccc] underline">Cancel import</button></div>}
    {error && <p role="alert" className="text-sm text-[#f5b800]">{error}</p>}
    {pending && <div className="space-y-3 rounded-lg border border-[#555] p-3">
      <h3 className="text-sm font-medium text-white">Review imported text</h3>
      <p className="break-words text-xs text-[#ccc]">{pending.fileName}: {pending.chapters.length} section(s), {pending.totalWords.toLocaleString()} words.</p>
      {pending.warnings.map(warning => <p key={warning} className="text-xs leading-relaxed text-[#f5b800]">{warning}</p>)}
      <div aria-label="Imported chapter preview" className="manuscript-preview max-h-72 space-y-4 overflow-auto break-words rounded bg-[#222] p-3 text-sm leading-relaxed text-[#ddd]">
        {pending.chapters.map(chapter => <section key={chapter.chapterNumber}><h4 dir="auto" className="mb-2 font-semibold">{chapter.title}</h4><div dir="auto" dangerouslySetInnerHTML={{ __html: chapter.content }} /></section>)}
      </div>
      <p className="text-xs text-[#ccc]">{chapterCount ? `Using this import replaces your ${chapterCount} current chapter(s).` : 'Use this import to add your chapters.'} Nothing is published until you save or publish.</p>
      <div className="flex flex-wrap gap-3"><button type="button" className="min-h-11 rounded-lg bg-[#e8442a] px-3 text-sm text-white" onClick={() => { onImport(pending); setPending(null); }}>Use these chapters</button><button type="button" className="min-h-11 px-3 text-sm text-[#ccc]" onClick={() => setPending(null)}>Discard import</button></div>
    </div>}
    {fileName && <p className="break-words text-xs text-[#4ade80]">Imported {fileName} into {chapterCount} reading section(s). You can edit the chapters below.</p>}
  </div>;
}
