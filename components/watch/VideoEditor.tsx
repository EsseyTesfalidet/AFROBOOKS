'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, UploadCloud } from 'lucide-react';
import type { Upload as TusUpload } from 'tus-js-client';
import VideoCoverInput, { uploadVideoCover } from './VideoCoverInput';
import { readVideoDuration, uploadReservation } from '@/lib/watch/upload';
import { VIDEO_CATEGORIES } from '@/types/video';
import { watchActionRequest, WatchFeedback } from './WatchUI';
import type { StudioEntry } from './WatchStudio';
import StudioPreview from './StudioPreview';
import PublishedVideoEditor from './PublishedVideoEditor';
import RemoveVideoButton from './RemoveVideoButton';

function LocalVideoPreview({ file }: { file: File }) {
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file); const video = player.current;
    if (video) video.src = url;
    return () => { if (video) { video.removeAttribute('src'); video.load(); } URL.revokeObjectURL(url); };
  }, [file]);
  return <video ref={player} className="watch-upload-preview" controls playsInline preload="metadata" aria-label="Selected video preview" />;
}

interface Props { entry?: StudioEntry; hosting: boolean; approved: boolean; onSaved: (id: string, message: string) => void; onRemoved: (id: string) => void; close: () => void }
export default function VideoEditor(props: Props) {
  return props.entry && ['published', 'unlisted'].includes(props.entry.video.status) ? <PublishedVideoEditor entry={props.entry} approved={props.approved} onSaved={props.onSaved} onRemoved={props.onRemoved} close={props.close} /> : <DraftVideoEditor key={props.entry?.video.status || 'new'} {...props} />;
}
function DraftVideoEditor({ entry, hosting, approved, onSaved, onRemoved, close }: Props) {
  const video = entry?.video; const id = video?.id;
  const [title, setTitle] = useState(video?.title || ''); const [description, setDescription] = useState(video?.description || '');
  const [category, setCategory] = useState(video?.category || VIDEO_CATEGORIES[0]); const [language, setLanguage] = useState(video?.language || 'English');
  const [price, setPrice] = useState(String((video?.priceCents || 0) / 100)); const [newsDate, setNewsDate] = useState(video?.newsDate || '');
  const [rights, setRights] = useState(entry?.private?.rightsStatement || ''); const [accepted, setAccepted] = useState(false);
  const [coverFile, setCoverFile] = useState<File>();
  const [file, setFile] = useState<File>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [submissionPending, setSubmissionPending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null); const [phase, setPhase] = useState('');
  const [manualMinutes, setManualMinutes] = useState(''); const [captionLanguage, setCaptionLanguage] = useState('ti');
  const draftId = useRef(id); const running = useRef(false); const uploaded = useRef(false);
  const upload = useRef<TusUpload | null>(null); const cancelUpload = useRef<(() => void) | null>(null);
  const editable = approved && (!video || video.status === 'draft');
  const unsaved = !!coverFile || !!file || title !== (video?.title || '') || description !== (video?.description || '') || category !== (video?.category || VIDEO_CATEGORIES[0]) || language !== (video?.language || 'English') || Math.round(Number(price) * 100) !== (video?.priceCents || 0) || newsDate !== (video?.newsDate || '') || rights !== (entry?.private?.rightsStatement || '');
  const preparing = video?.status === 'processing';
  const stage = progress !== null ? 'Uploading' : preparing ? 'Preparing' : video?.status === 'in_review' ? 'Awaiting review' : video?.status === 'removed' ? 'Removed' : 'Draft';
  function chooseFile(selected?: File) {
    if (!selected || !editable || !hosting || busy) return;
    if (!/\.(mp4|mov|mkv|webm|m4v)$/i.test(selected.name) || selected.size > 10 * 1024 ** 3) { setError('Choose an MP4, MOV, MKV, M4V or WebM video up to 10 GB.'); return; }
    setError(''); setFile(selected); uploaded.current = false;
    if (!title) setTitle(selected.name.replace(/\.[^.]+$/, '').slice(0, 160));
  }
  useEffect(() => () => { void upload.current?.abort(); cancelUpload.current?.(); }, []);
  useEffect(() => {
    if (!busy && !unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const leave = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download') || link.getAttribute('href')?.startsWith('#') || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
      if (!window.confirm(busy ? 'An upload or save is in progress. Leave this editor?' : 'Leave without saving your draft changes?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn); document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', leave, true); };
  }, [busy, unsaved]);
  async function run(task: () => Promise<void>) {
    if (running.current) return; running.current = true; setBusy(true); setError('');
    try { await task(); } catch (failure) { setError((failure as Error).message); }
    finally { running.current = false; setBusy(false); setProgress(null); setPhase(''); upload.current = null; cancelUpload.current = null; }
  }
  async function transfer(target: string, media: File, kind: 'full' | 'trailer') {
    if (!/\.(mp4|mov|mkv|webm|m4v)$/i.test(media.name)) throw new Error('Choose an MP4, MOV, MKV, M4V or WebM video.');
    setPhase('Reading your video…');
    // An interrupted legacy upload must reuse its original reservation.
    const maximumSeconds = entry?.private?.[kind]?.maximumSeconds || uploadReservation(kind === 'full' && manualMinutes ? Number(manualMinutes) * 60 : await readVideoDuration(media), kind === 'trailer');
    const { uploadUrl } = await watchActionRequest<{ uploadUrl: string }>('upload', { id: target, kind, size: media.size, maximumSeconds });
    const { Upload: ResumableUpload } = await import('tus-js-client');
    setProgress(0); setPhase(kind === 'trailer' ? 'Uploading trailer…' : 'Uploading your video…');
    await new Promise<void>((resolve, reject) => {
      cancelUpload.current = () => reject(new Error('Upload paused. Keep this file selected and submit again to resume.'));
      upload.current = new ResumableUpload(media, {
        uploadUrl, chunkSize: 50 * 1024 * 1024, retryDelays: [0, 1000, 3000, 5000, 10000],
        onProgress: (sent, total) => setProgress(Math.round(sent / total * 100)),
        onError: () => reject(new Error('Upload interrupted. Submit again with the same file to resume within 24 hours.')),
        onSuccess: () => resolve(),
      }); upload.current.start();
    });
    setProgress(null);
  }
  async function finishSubmission(target: string) {
    setPhase('Submitting…'); setSubmissionPending(true);
    const result = await watchActionRequest<{ status: string }>('submit', { id: target });
    setSubmissionPending(false); setFile(undefined);
    onSaved(target, result.status === 'in_review' ? 'Submitted for review. Your video will appear in Screen after approval.' : 'Submitted. We’ll prepare your video and send it for review automatically. You can leave this page.');
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const submit = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') !== 'draft';
    void run(async () => {
      if (submit && !file && !entry?.private?.full) throw new Error('Choose your music video, film or clip first.');
      draftId.current ??= crypto.randomUUID();
      setPhase('Saving details…');
      await watchActionRequest('draft', { id: draftId.current, draft: { title, description, category, language, priceCents: Math.round(Number(price) * 100), newsDate, rightsStatement: rights, rightsAccepted: accepted } });
      if (coverFile) { setPhase('Saving cover photo…'); await uploadVideoCover(draftId.current, coverFile); setCoverFile(undefined); }
      if (file && !uploaded.current) { await transfer(draftId.current, file, 'full'); uploaded.current = true; }
      if (submit) {
        await finishSubmission(draftId.current);
      } else {
        setFile(undefined); onSaved(draftId.current, 'Draft saved. You can return to it from Your videos.');
      }
    });
  }
  return <section className="watch-editor">
    <button className="watch-back" disabled={busy} onClick={() => { if (!unsaved || window.confirm('Leave without saving your draft changes?')) close(); }}><ArrowLeft size={17} />Your videos</button>
    <h2>{video?.title || 'Upload a video'}</h2>
    <ol className="watch-upload-steps" aria-label="Publication progress">{['Uploading', 'Preparing', 'Awaiting review', 'Published'].map(label => <li key={label} aria-current={stage === label ? 'step' : undefined}>{label}</li>)}</ol>
    <p className="watch-muted" role="status">{phase || `Status: ${stage}`}</p>
    {entry?.private?.reviewNote && <p className="watch-notice">Review note: {entry.private.reviewNote}</p>}
    {video?.status === 'removed' && <p className="watch-notice">This video is removed. Contact the review team if you need it restored.</p>}
    {preparing && <p className="watch-notice">Your submission is saved. We’ll check preparation automatically and send it for review when ready. You can close this page.{entry?.private?.processingError && <span> {entry.private.processingError}</span>}</p>}
    {!approved && <p className="watch-notice">Creator access is paused. You can view your content; contact support before making changes.</p>}
    {id && <><StudioPreview id={id} title={title} poster={video?.posterUrl} ready={!!entry?.private?.full?.ready} asset={entry?.private?.full} pending={entry?.private?.fullPending} processingError={entry?.private?.processingError} />{entry?.private?.trailer && <details className="watch-upload-options"><summary>Preview optional trailer</summary><StudioPreview id={id} title={title} poster={video?.posterUrl} ready={entry.private.trailer.ready} asset={entry.private.trailer} pending={entry.private.trailerPending} trailer /></details>}</>}
    <form onSubmit={save}><fieldset disabled={busy || !editable || submissionPending}>
      {(!entry?.private?.full?.ready && !preparing) && <div className="watch-upload-drop" data-dragging={dragging} onDragOver={event => { event.preventDefault(); if (editable && hosting && !busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}>
        {file ? <><LocalVideoPreview file={file} /><span className="watch-upload-filename">{file.name}</span></> : <><UploadCloud size={44} aria-hidden="true" /><strong>Drag your video here</strong><small>Or select a file from your device. For music, choose your music video.</small></>}
        <label className="watch-button watch-primary">{file ? 'Change video' : 'Select video'}<input className="sr-only" aria-label="Main video or clip file" type="file" accept=".mp4,.mov,.mkv,.m4v,.webm" disabled={!hosting} onChange={event => chooseFile(event.target.files?.[0])} /></label>
        <small>Your video stays private until it is reviewed and published.</small>
      </div>}
      {entry?.private?.full && <p className="watch-muted">{entry.private.full.ready ? 'Video ready.' : 'Finish uploading the selected file before submitting. The preview updates when the video is ready.'}</p>}
      {!hosting && <p className="watch-notice">You can save a draft. Uploads will become available when hosting is configured.</p>}
      <div hidden={!file && !id && hosting}>
      <label>Title<input value={title} onChange={event => setTitle(event.target.value)} required minLength={2} maxLength={160} dir="auto" /></label>
      <VideoCoverInput file={coverFile} current={video?.posterUrl} onChange={setCoverFile} />
      <p className="watch-muted">Your selected cover is saved with your draft or submission.</p>
      <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} required minLength={20} maxLength={5000} rows={3} dir="auto" /></label>
      <div className="watch-fields"><label>Category<select value={category} onChange={event => setCategory(event.target.value as typeof category)}>{VIDEO_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label><label>Spoken language<input value={language} onChange={event => setLanguage(event.target.value)} required minLength={2} maxLength={60} /></label></div>
      <div className="watch-fields"><label>Price in USD (0 = free)<input type="number" min="0" max="49.99" step="0.01" value={price} onChange={event => setPrice(event.target.value)} required /></label>{category === 'News & interviews' && <label>News publication date<input type="date" value={newsDate} onChange={event => setNewsDate(event.target.value)} required /></label>}</div>
      <p className="watch-muted">Paid access starts at $0.99. You receive 80% of Google’s confirmed revenue after fees, taxes and refunds; AfroBooks keeps 20%.</p>
      <label>Rights declaration<textarea value={rights} onChange={event => setRights(event.target.value)} required minLength={30} maxLength={3000} rows={2} placeholder="Who owns the video and music, and what permission do you have to distribute them?" /></label>
      <label className="watch-check"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} required />I own or have permission to distribute the video, music, images and performances.</label>
      <details className="watch-upload-options"><summary>Upload options</summary><label>Video length in minutes (only if automatic detection fails)<input type="number" min="1" max="180" value={manualMinutes} onChange={event => setManualMinutes(event.target.value)} /></label><p className="watch-muted">The cover photo is optional. Save a draft first if you want to add a trailer or subtitles before submitting.</p></details>
      {editable && <div className="watch-actions"><button className="watch-button watch-primary" type="submit" value="submit" disabled={(!file && !entry?.private?.full) || !!entry?.private?.fullPending || !!entry?.private?.trailerPending || !!entry?.private?.captionsPending}>{busy ? phase || 'Working…' : 'Submit'}</button><button className="watch-button" type="submit" value="draft">Save draft</button></div>}
      </div>
    </fieldset></form>
    {submissionPending && !busy && <div className="watch-notice"><p>Your submission may already be saved. Check it here without uploading again.</p><button className="watch-button" onClick={() => void run(() => finishSubmission(draftId.current!))}>Check submission</button></div>}
    {progress !== null && <div role="status"><progress aria-label="Video upload progress" value={progress} max={100} /><p>{progress}% uploaded · keep this page open until uploading finishes.</p><button className="watch-button" onClick={async () => { await upload.current?.abort(); cancelUpload.current?.(); }}>Pause upload</button></div>}
    {id && editable && <details className="watch-upload-options"><summary>Optional trailer and subtitles</summary>
      {unsaved && <p className="watch-notice">Save your draft changes before adding optional files.</p>}
      <fieldset disabled={busy || unsaved}>
        <label>Optional trailer file<input type="file" accept=".mp4,.mov,.mkv,.m4v,.webm" disabled={!hosting || !!entry?.private?.trailer?.ready} onChange={event => { const media = event.target.files?.[0]; event.target.value = ''; if (media) void run(async () => { await transfer(id, media, 'trailer'); onSaved(id, 'Trailer received. Preparation is checked automatically.'); }); }} /></label>
        {entry?.private?.full?.ready && <><label>Subtitle language code<input value={captionLanguage} onChange={event => setCaptionLanguage(event.target.value)} minLength={2} maxLength={2} pattern="[a-z]{2}" /></label><p className="watch-muted">Use UTF-8 WebVTT (.vtt); ti for Tigrinya, en for English.</p>{(['full', 'trailer'] as const).filter(kind => entry.private[kind]?.ready).map(kind => <label key={kind}>Subtitles for {kind === 'full' ? 'main video or clip' : 'trailer'}<input type="file" accept=".vtt,text/vtt" onChange={event => { const media = event.target.files?.[0]; event.target.value = ''; if (media) void run(async () => { if (media.size > 500_000) throw new Error('Use a subtitle file smaller than 500 KB.'); await watchActionRequest('captions', { id, kind, language: captionLanguage, text: await media.text() }); onSaved(id, 'Subtitles saved. Preview the video to check their timing.'); }); }} /></label>)}</>}
      </fieldset>
    </details>}
    {id && <div className="watch-actions">{(preparing || video?.status === 'in_review') && !video?.publishedAt && <button className="watch-button" disabled={busy} onClick={() => void run(async () => { await watchActionRequest('cancel_submission', { id }); onSaved(id, 'Returned to draft. You can edit and submit again.'); })}>Return to draft</button>}</div>}
    {video && <RemoveVideoButton video={video} disabled={busy || submissionPending} onRemoved={onRemoved} />}
    <WatchFeedback error={error} />
  </section>;
}
