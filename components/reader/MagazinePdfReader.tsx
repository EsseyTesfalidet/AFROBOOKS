'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useAuthStore } from '@/store/authStore';
import type { Book } from '@/types/book';
import { publicationTitle } from '@/lib/utils/publication';

export default function MagazinePdfReader({ book }: { book: Book }) {
  const user = useAuthStore(s => s.firebaseUser);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(320);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  const [text, setText] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const pageKey = `afrobooks:pdf:${user?.uid}:${book.id}`;

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, entries[0].contentRect.width - 32)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    setError(''); setBusy(true); setPdf(null);
    async function load() {
      if (!user) throw new Error('Sign in to open your magazine.');
      const token = await user.getIdToken();
      const response = await fetch(`/api/books/${encodeURIComponent(book.id)}/pdf?view=read`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('This PDF could not be opened. Check that this issue is in your library and try again.');
      const data = new Uint8Array(await response.arrayBuffer());
      if (!active) return;
      const library = await import('pdfjs-dist');
      library.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      if (!active) return;
      task = library.getDocument({ data, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/' });
      const document = await task.promise;
      if (!active) return;
      let saved = 1;
      try { saved = Number(localStorage.getItem(pageKey)) || 1; } catch {}
      setPage(Math.max(1, Math.min(document.numPages, Math.floor(saved))));
      setPdf(document);
    }
    void load().catch(cause => { if (active) { setError(cause instanceof Error ? cause.message : 'Unable to open the PDF.'); setBusy(false); } });
    return () => { active = false; controller.abort(); void task?.destroy(); };
  }, [book.id, user, pageKey, retry]);

  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let active = true;
    let render: RenderTask | undefined;
    setBusy(true); setText('');
    async function draw() {
      const pdfPage = await pdf!.getPage(page);
      if (!active || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(width, 1100) / base.width * zoom;
      const viewport = pdfPage.getViewport({ scale });
      const pixels = Math.min(window.devicePixelRatio || 1, 2, 8192 / Math.max(viewport.width, viewport.height), Math.sqrt(8_000_000 / (viewport.width * viewport.height)));
      if (!Number.isFinite(pixels) || pixels <= 0) throw new Error('Invalid page dimensions');
      const element = canvas.current;
      element.width = Math.ceil(viewport.width * pixels); element.height = Math.ceil(viewport.height * pixels);
      element.style.width = `${viewport.width}px`; element.style.height = `${viewport.height}px`;
      render = pdfPage.render({ canvas: element, viewport, transform: pixels === 1 ? undefined : [pixels, 0, 0, pixels, 0, 0] });
      await render.promise;
      const content = await pdfPage.getTextContent();
      if (!active) return;
      setText(content.items.map(item => 'str' in item ? item.str : '').join(' '));
      setBusy(false);
      try { localStorage.setItem(pageKey, String(page)); } catch {}
    }
    void draw().catch(cause => { if (active && cause?.name !== 'RenderingCancelledException') { setError('This page could not be displayed. Try reopening the issue.'); setBusy(false); } });
    return () => { active = false; render?.cancel(); };
  }, [pdf, page, width, zoom, pageKey]);

  return <main className="flex h-[100dvh] flex-col bg-[#151515] text-white">
    <header className="shrink-0 border-b border-white/10 px-3 py-2 sm:px-5">
      <div className="flex items-center gap-3"><Link href={`/book/${book.id}`} className="shrink-0 py-2 text-sm text-[#f5b800]">← Details</Link><h1 className="min-w-0 truncate text-sm font-medium">{publicationTitle(book)}</h1></div>
      <nav aria-label="Magazine pages" className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2"><button type="button" disabled={!pdf || page <= 1} onClick={() => setPage(p => p - 1)} className="min-h-11 rounded-lg border border-white/20 px-3 disabled:opacity-40">Previous</button><span aria-live="polite">{pdf ? `${page} / ${pdf.numPages}` : 'Loading…'}</span><button type="button" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(p => p + 1)} className="min-h-11 rounded-lg border border-white/20 px-3 disabled:opacity-40">Next</button></div>
        <label className="flex items-center gap-2">Zoom<select aria-label="PDF zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))} className="min-h-11 rounded-lg bg-[#292929] px-2"><option value={1}>Fit width</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>
      </nav>
    </header>
    <div ref={container} className="min-h-0 flex-1 overflow-auto p-4" aria-busy={busy}>
      {error ? <div role="alert" className="mx-auto max-w-lg py-8"><p>{error}</p><button onClick={() => setRetry(r => r + 1)} className="mt-4 min-h-11 text-[#f5b800] underline">Try again</button></div> : <>
        {busy && <p role="status" className="pb-3 text-center text-sm text-[#aaa]">Opening page…</p>}
        <canvas ref={canvas} role="img" aria-label={`Magazine page ${page}`} className="mx-auto bg-white shadow-xl" />
        {text && <details className="mx-auto mt-4 max-w-3xl text-sm text-[#ccc]"><summary className="cursor-pointer py-3">Read page text</summary><p className="whitespace-pre-wrap leading-relaxed">{text}</p></details>}
      </>}
    </div>
  </main>;
}
