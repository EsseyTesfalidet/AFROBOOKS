'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';
import { authenticatedPost } from '@/lib/firebase/request';
import { useAuthStore } from '@/store/authStore';
import { AUDIO_CATEGORIES, type AudioTitle } from '@/types/audio';
import { AUDIO_MAX_BYTES, AUDIO_MAX_PARTS, audioChapters, audioTime, parseAudioTime, validateChapterDuration } from '@/lib/audio/policy';
import { prepareAudioSample, uploadAudioCover } from './audioRequests';

const action = <T,>(name: string, data: unknown) => authenticatedPost<T>('/api/audio', { action: name, data });
type Part = { key: string; id?: string; title: string; file?: File; ready: boolean; durationSeconds: number };
export async function audioFileDuration(file: File) {
  if (!file.name.toLowerCase().endsWith('.mp3') || file.size < 128 || file.size > AUDIO_MAX_BYTES) throw new Error('Choose an MP3 file up to 250 MB.');
  return new Promise<number>((resolve, reject) => {
    const audio = new Audio(); const url = URL.createObjectURL(file);
    const cleanup = () => { audio.onloadedmetadata = null; audio.onerror = null; clearTimeout(timer); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Unable to read the audio. Export a new MP3 and try again.')); }, 15000);
    audio.onloadedmetadata = () => { const duration = audio.duration; cleanup(); if (Number.isFinite(duration) && duration > 0 && duration <= 172800) resolve(duration); else reject(new Error('This file has no readable audio duration. Export it as MP3 and try again.')); };
    audio.onerror = () => { cleanup(); reject(new Error('Your browser could not read this MP3.')); }; audio.src = url;
  });
}
function CoverChoice({ url, file, busy, onChange }: { url: string; file: File | null | undefined; busy: boolean; onChange: (file: File | null) => void }) {
  const image = useRef<HTMLImageElement>(null); const [error, setError] = useState('');
  useEffect(() => { if (!file || !image.current) return; const value = URL.createObjectURL(file); image.current.src = value; return () => URL.revokeObjectURL(value); }, [file]);
  const preview = !!file || (file !== null && !!url);
  return <fieldset className="listen-editor-section"><legend>Cover image <span className="listen-muted">Optional</span></legend>
    {/* Local blob previews do not go through the image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {preview && <img ref={image} className="listen-cover-preview" src={file ? undefined : url} alt="Audio cover preview" />}
    <label>Upload cover<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const next = event.target.files?.[0]; setError(''); if (!next) return; if (next.size > 3_000_000 || !['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) { setError('Choose a JPG, PNG or WebP image smaller than 3 MB.'); event.target.value = ''; return; } onChange(next); }} /></label>
    <p className="listen-muted">A square image works best. Without one, we show artwork for your audio format.</p>
    {preview && <button type="button" className="watch-button" disabled={busy} onClick={() => onChange(null)}>Remove cover</button>}{error && <p role="alert">{error}</p>}
  </fieldset>;
}
export default function AudioEditor({ title, done, cancel }: { title?: AudioTitle; done: () => void; cancel: () => void }) {
  const [category, setCategory] = useState(title?.category || 'Music');
  const [id, setId] = useState(title?.id || ''); const [file, setFile] = useState<File | null>(null);
  const [ready, setReady] = useState(!!title?.ready); const [mainDuration, setMainDuration] = useState(title?.mainDurationSeconds ?? title?.durationSeconds ?? 0);
  const [sampleReady, setSampleReady] = useState(!!title?.previewReady); const [cover, setCover] = useState<File | null | undefined>(); const [coverUrl, setCoverUrl] = useState(title?.coverUrl || '');
  const [parts, setParts] = useState<Part[]>((title?.parts || []).map(part => ({ ...part, key: part.id })));
  const [chapters, setChapters] = useState((title?.chapters || []).map(chapter => ({ key: crypto.randomUUID(), title: chapter.title, time: audioTime(chapter.startSeconds) })));
  const [busy, setBusy] = useState(false); const [stage, setStage] = useState(''); const [progress, setProgress] = useState<number | null>(null); const [error, setError] = useState('');
  const task = useRef<UploadTask | null>(null);
  useEffect(() => () => { task.current?.cancel(); }, []);
  useEffect(() => { if (!busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [busy]);
  async function upload(path: string, source: File) {
    setProgress(0); task.current = uploadBytesResumable(ref(storage, path), source, { contentType: 'audio/mpeg' });
    await new Promise<void>((resolve, reject) => { task.current!.on('state_changed', snapshot => setProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, resolve); });
    task.current = null; setProgress(null);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setStage('Saving details…');
    try {
      const data = new FormData(event.currentTarget);
      const parsed = audioChapters.safeParse(chapters.map(chapter => ({ title: chapter.title, startSeconds: parseAudioTime(chapter.time) })));
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Check your chapter times. Use minutes:seconds, starting at 0:00.');
      const draft = { title: data.get('title'), description: data.get('description'), category, language: data.get('language'), mainTitle: data.get('mainTitle'), priceCents: category === 'Music' ? 0 : Math.round(Number(data.get('price')) * 100), musicSubscription: category === 'Music' && data.get('musicSubscription') === 'on', rightsAccepted: data.get('rights') === 'on' };
      if (!ready && !file) throw new Error('Choose the first MP3 to upload.');
      if (parts.some(part => !part.ready && !part.file)) throw new Error('Reselect the original file for each unfinished part, or remove that part.');
      const duration = ready ? mainDuration : await audioFileDuration(file!);
      // Check every file before reserving storage or starting an upload.
      let working = await Promise.all(parts.map(async part => ({ ...part, durationSeconds: part.ready ? part.durationSeconds : await audioFileDuration(part.file!) })));
      validateChapterDuration(parsed.data, duration + working.reduce((sum, part) => sum + part.durationSeconds, 0));
      let draftId = id;
      if (draftId) await action('edit', { ...draft, id: draftId });
      else { const created = await action<{ id: string }>('create', draft); draftId = created.id; setId(draftId); }
      if (!ready) {
        setStage('Uploading first recording…'); const uid = useAuthStore.getState().firebaseUser?.uid; if (!uid) throw new Error('Please sign in again.');
        // A previous save may have finished the file while its response was lost.
        let recovered = false;
        try { await action('finish', { id: draftId, durationSeconds: duration }); recovered = true; }
        catch (failure) { if (!(failure as Error).message.includes('Upload the MP3 first')) throw failure; }
        if (!recovered) { await upload(`audio/${uid}/${draftId}/source.mp3`, file!); await action('finish', { id: draftId, durationSeconds: duration }); }
        setReady(true); setMainDuration(duration); setFile(null);
      }
      for (let index = 0; index < working.length; index++) {
        let part = working[index]; if (part.ready) continue;
        setStage(`Uploading ${part.title} (${index + 2} of ${working.length + 1})…`);
        if (!part.id) {
          const reserved = await action<{ partId: string }>('prepare_part', { id: draftId, partId: part.key, title: part.title, bytes: part.file!.size });
          part = { ...part, id: reserved.partId }; working = working.map((item, i) => i === index ? part : item); setParts(working);
        }
        let recovered = false;
        try { await action('finish_part', { id: draftId, partId: part.id, durationSeconds: part.durationSeconds }); recovered = true; }
        catch (failure) { if (!(failure as Error).message.includes('Upload this part first')) throw failure; }
        if (!recovered) {
          const uid = useAuthStore.getState().firebaseUser?.uid; if (!uid) throw new Error('Please sign in again.');
          await upload(`audio/${uid}/${draftId}/part-source-${part.id}.mp3`, part.file!);
          await action('finish_part', { id: draftId, partId: part.id, durationSeconds: part.durationSeconds });
        }
        working = working.map((item, i) => i === index ? { ...part, ready: true, file: undefined } : item); setParts(working);
      }
      setStage('Saving chapters…');
      await action('edit', { ...draft, id: draftId, chapters: parsed.data, partTitles: working.map(part => ({ id: part.id, title: part.title })) });
      if (cover !== undefined) { setStage('Saving cover…'); const result = await uploadAudioCover(draftId, cover); setCoverUrl(result.coverUrl); setCover(undefined); }
      if (!sampleReady) { setStage('Preparing the free sample…'); await prepareAudioSample(draftId); setSampleReady(true); }
      done();
    } catch (failure) { setError((failure as Error).message); } finally { task.current = null; setBusy(false); setProgress(null); setStage(''); }
  }
  async function removePart(part: Part) {
    if (!part.id) { setParts(current => current.filter(item => item.key !== part.key)); return; }
    setBusy(true); setError('');
    try { await action('remove_part', { id, partId: part.id }); setParts(current => current.filter(item => item.key !== part.key)); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <form className="listen-studio-form" onSubmit={save}><h2>{title ? 'Edit audio' : 'Upload audio'}</h2><p className="listen-muted">Upload one recording or a collection of tracks, episodes or audiobook parts. MP3, up to 250 MB per file and 1 GB per title. One purchase includes every part.</p>
    <label>Title<input name="title" defaultValue={title?.title} required minLength={2} maxLength={160} disabled={busy} /></label>
    <label>Format<select aria-label="Format" value={category} onChange={event => setCategory(event.target.value as typeof category)} disabled={busy}>{AUDIO_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Language<input name="language" defaultValue={title?.language || ''} placeholder="For example, Tigrinya" minLength={2} maxLength={60} required disabled={busy} /></label>
    <label>Description<textarea name="description" defaultValue={title?.description} minLength={10} maxLength={4000} required disabled={busy} /></label>
    {category === 'Music' ? <label><input type="checkbox" name="musicSubscription" defaultChecked={title?.musicSubscription} disabled={busy} />Include this music in the monthly Music pass. Leave unchecked for free listening.</label> : <label>Price in USD<input name="price" type="number" min="0" max="99.99" step="0.01" defaultValue={(title?.priceCents || 0) / 100} required disabled={busy} /><small>0 = free. Paid audio starts at $0.99 for the entire title. Google Play sets the local checkout price after admin setup.</small></label>}
    {category === 'Music' && <p className="listen-muted">Participating artists share 80% of each subscriber’s verified revenue after Google fees and taxes, based on listening. AfroBooks keeps 20%. Earnings are allocated after the billing cycle and paid monthly.</p>}
    <CoverChoice url={coverUrl} file={cover} busy={busy} onChange={setCover} />
    <fieldset className="listen-editor-section"><legend>Recordings</legend><label>First recording name<input name="mainTitle" defaultValue={title?.mainTitle || 'Part 1'} maxLength={120} required disabled={busy} /></label>
      {!ready ? <label>MP3 file<input type="file" accept=".mp3,audio/mpeg" disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)} /></label> : <p className="listen-muted">First recording ready · {audioTime(mainDuration)}</p>}
      {parts.map((part, index) => <div className="listen-part-editor" key={part.key}><label>Recording {index + 2} name<input value={part.title} maxLength={120} required disabled={busy} onChange={event => setParts(current => current.map(item => item.key === part.key ? { ...item, title: event.target.value } : item))} /></label><p className="listen-muted">{part.ready ? `Ready · ${audioTime(part.durationSeconds)}` : part.file?.name || 'Reselect the original MP3 to finish this upload.'}</p>
        {!part.ready && <label>File for recording {index + 2}<input type="file" accept=".mp3,audio/mpeg" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) setParts(current => current.map(item => item.key === part.key ? { ...item, file } : item)); }} /></label>}
        <button type="button" className="watch-button" disabled={busy} onClick={() => void removePart(part)}>Remove recording {index + 2}</button></div>)}
      <label>Add tracks, episodes or parts<input type="file" accept=".mp3,audio/mpeg" multiple disabled={busy || parts.length >= AUDIO_MAX_PARTS - 1} onChange={event => { const files = Array.from(event.target.files || []); if (parts.length + files.length >= AUDIO_MAX_PARTS) { setError('A title can contain up to 50 recordings.'); return; } setParts(current => [...current, ...files.map(file => ({ key: crypto.randomUUID(), title: file.name.replace(/\.mp3$/i, '').slice(0, 120), file, ready: false, durationSeconds: 0 }))]); event.target.value = ''; }} /></label>
      {id && !ready && <p className="listen-muted">If upload reached 100% but saving failed, select the same file and save again. We recover completed uploads automatically.</p>}
    </fieldset>
    <fieldset className="listen-editor-section"><legend>Chapters <span className="listen-muted">Optional</span></legend><p className="listen-muted">Add named markers inside your recording. Times run across the entire title, starting at 0:00. Use minutes:seconds or hours:minutes:seconds.</p>
      {chapters.map((chapter, index) => <div className="listen-chapter-editor" key={chapter.key}><label>Chapter {index + 1}<input value={chapter.title} maxLength={120} required disabled={busy} onChange={event => setChapters(current => current.map(item => item.key === chapter.key ? { ...item, title: event.target.value } : item))} /></label><label>Start time {index + 1}<input value={chapter.time} placeholder="0:00" required disabled={busy} onChange={event => setChapters(current => current.map(item => item.key === chapter.key ? { ...item, time: event.target.value } : item))} /></label><button type="button" className="watch-button" disabled={busy} onClick={() => setChapters(current => current.filter(item => item.key !== chapter.key))}>Remove chapter {index + 1}</button></div>)}
      <button type="button" className="watch-button" disabled={busy || chapters.length >= 100} onClick={() => setChapters(current => [...current, { key: crypto.randomUUID(), title: '', time: current.length ? '' : '0:00' }])}>Add chapter</button>
    </fieldset>
    <p className="listen-notice">A free sample of up to the first minute is prepared automatically from the first recording. {sampleReady ? 'Your sample is ready.' : 'Your full recording stays protected.'}</p>
    <label><input type="checkbox" name="rights" required disabled={busy} defaultChecked={!!title} />I own this recording or have permission to distribute and sell it, including its music, narration and artwork.</label>
    {busy && <div role="status">{stage}{progress !== null && <><progress max="100" value={progress} /> {progress}% uploaded</>}</div>}{error && <p role="alert">{error}</p>}
    <div className="listen-studio-actions"><button className="watch-button watch-primary" disabled={busy}>{busy ? 'Saving audio…' : 'Save draft'}</button><button type="button" className="watch-button" disabled={busy} onClick={cancel}>Close</button>{busy && progress !== null && <button type="button" className="watch-button" onClick={() => task.current?.cancel()}>Cancel upload</button>}</div>
  </form>;
}
