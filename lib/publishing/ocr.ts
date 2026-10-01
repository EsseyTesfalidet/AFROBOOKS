export const OCR_LANGUAGES = [
  { code: 'eng', label: 'English' }, { code: 'tir', label: 'Tigrinya' },
  { code: 'amh', label: 'Amharic' }, { code: 'ara', label: 'Arabic' },
  { code: 'fra', label: 'French' }, { code: 'swa', label: 'Swahili' },
  { code: 'yor', label: 'Yoruba' }, { code: 'por', label: 'Portuguese' },
  { code: 'chi_sim', label: 'Chinese (simplified)' },
] as const;
export type OcrLanguage = typeof OCR_LANGUAGES[number]['code'];
export interface PdfImportOptions { mode?: 'text' | 'ocr'; language?: OcrLanguage; signal?: AbortSignal }

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Import cancelled', 'AbortError'));
    if (signal.aborted) { promise.catch(() => {}); abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function createOcrWorker(language: OcrLanguage, signal: AbortSignal, progress?: (message: string) => void) {
  if (!OCR_LANGUAGES.some(item => item.code === language)) throw new Error('Choose a supported OCR language.');
  signal.throwIfAborted();
  progress?.('Loading text recognition…');
  // Own the worker from its creation so cancellation and failed language
  // downloads can always terminate it. The 7.0.0 SDK only exposes its worker
  // after initialization, and can leave that promise pending on model errors.
  // This message protocol is tested against the pinned worker asset.
  const worker = new Worker('/ocr/worker.min.js');
  const jobs = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();
  let sequence = 0;
  let closed = false;
  const close = (error = new Error('OCR worker closed')) => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', abort);
    worker.terminate();
    for (const job of jobs.values()) job.reject(error);
    jobs.clear();
  };
  const abort = () => close(new DOMException('Import cancelled', 'AbortError'));
  signal.addEventListener('abort', abort, { once: true });
  worker.onerror = event => { event.preventDefault(); close(new Error('OCR worker could not load.')); };
  worker.onmessageerror = () => close(new Error('OCR worker could not read a page.'));
  worker.onmessage = ({ data }) => {
    if (closed) return;
    if (data.status === 'progress') {
      if (data.data?.status !== 'recognizing text' && Number.isFinite(data.data?.progress)) progress?.(`Preparing OCR: ${Math.round(data.data.progress * 100)}%`);
      return;
    }
    const job = jobs.get(data.jobId);
    if (!job) return;
    jobs.delete(data.jobId);
    if (data.status === 'resolve') job.resolve(data.data);
    else job.reject(new Error('OCR could not process this request.'));
  };
  const request = (action: string, payload: Record<string, unknown>) => new Promise<unknown>((resolve, reject) => {
    if (closed || signal.aborted) { reject(new DOMException('Import cancelled', 'AbortError')); return; }
    const jobId = `ocr-${++sequence}`;
    jobs.set(jobId, { resolve, reject });
    try { worker.postMessage({ workerId: 'afrobooks', jobId, action, payload }); }
    catch (cause) { jobs.delete(jobId); reject(cause); }
  });
  try {
    const assetUrl = (path: string) => new URL(path, window.location.origin).href;
    await request('load', { options: { corePath: assetUrl('/ocr/core/'), lstmOnly: true } });
    await request('loadLanguage', { langs: language, options: { langPath: assetUrl('/ocr-models/'), cachePath: 'afrobooks-ocr-fast-4.1.0', gzip: true, lstmOnly: true } });
    await request('initialize', { langs: language, oem: 1, config: {} });
    return {
      recognize: async (canvas: HTMLCanvasElement) => {
        signal.throwIfAborted();
        const blob = await abortable(new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('This PDF page could not be prepared for OCR.')), 'image/png')), signal);
        const bytes = new Uint8Array(await abortable(blob.arrayBuffer(), signal));
        const result = await request('recognize', { image: bytes, options: { rotateAuto: true }, output: { text: true } }) as { text: string; confidence: number };
        if (typeof result.text !== 'string' || !Number.isFinite(result.confidence)) throw new Error('OCR returned an unreadable result. Try a clearer scan.');
        return { text: result.text.trim(), confidence: result.confidence };
      },
      close: async () => { close(); },
    };
  } catch (error) {
    close();
    if (signal.aborted) signal.throwIfAborted();
    throw new Error('OCR could not start. Check your connection and try again, or use a searchable PDF or text file.', { cause: error });
  }
}
