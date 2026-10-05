'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { VIDEO_CATEGORIES, type WatchRevision } from '@/types/video';
import type { StudioEntry } from './WatchStudio';
import StudioPreview from './StudioPreview';
import RemoveVideoButton from './RemoveVideoButton';
import VideoCoverInput, { uploadVideoCover } from './VideoCoverInput';
import { videoDraftSchema, videoPrice } from '@/lib/watch/policy';
import { watchActionRequest, WatchFeedback } from './WatchUI';

export default function PublishedVideoEditor({ entry, approved, onSaved, onRemoved, close }: { entry: StudioEntry; approved: boolean; onSaved: (id: string, message: string) => void; onRemoved: (id: string) => void; close: () => void }) {
  const { video, private: media } = entry;
  const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const revision = media.pendingRevision;
  return <section className="watch-editor">
    <button className="watch-back" disabled={busy} onClick={() => { if (!editing || window.confirm('Leave without submitting these changes?')) close(); }}><ArrowLeft size={17} />Your videos</button>
    <h2 dir="auto">{video.title}</h2>
    <p className="watch-muted">{video.status === 'published' ? 'Published' : 'Unlisted · hidden from Screen and new purchases. Existing buyers keep access.'}</p>
    {media.pendingRevision?.cover && <img className="watch-editor-poster" src={media.pendingRevision.cover.url} alt="Cover photo awaiting review" />}
    <StudioPreview id={video.id} title={video.title} poster={video.posterUrl} ready={!!media.full?.ready} asset={media.full} processingError={media.processingError} />
    {media.trailer && <details className="watch-upload-options"><summary>Preview optional trailer</summary><StudioPreview id={video.id} title={video.title} poster={video.posterUrl} ready={media.trailer.ready} asset={media.trailer} trailer /></details>}
    {media.revisionReviewNote && <p className="watch-notice">Update review: {media.revisionReviewNote}</p>}
    {!approved && <p className="watch-notice">Creator access is paused. Contact support before making changes.</p>}
    {revision ? <div className="watch-notice"><h3>Changes awaiting review</h3><p>The current version remains available to its viewers while your changes are reviewed.</p><p dir="auto">Requested title: {revision.draft.title}</p><p>Requested price: {videoPrice(revision.draft.priceCents)}</p><button type="button" className="watch-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await watchActionRequest('creator_withdraw_revision', { id: video.id, revisionId: revision.id }); onSaved(video.id, 'Changes withdrawn. You can edit again.'); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>Withdraw changes</button></div> : editing && approved ? <RevisionForm entry={entry} cancel={() => setEditing(false)} onSaved={(id, message) => { setEditing(false); onSaved(id, message); }} /> : <>
      <p className="watch-description" dir="auto">{video.description}</p><p className="watch-muted">{video.category} · {video.language} · {videoPrice(video.priceCents)}</p>
      {approved && <button type="button" className="watch-button watch-primary" onClick={() => setEditing(true)}><Pencil size={16} aria-hidden="true" />Edit details</button>}
    </>}
    <RemoveVideoButton video={video} disabled={busy || editing} onRemoved={onRemoved} />
    <WatchFeedback error={error} />
  </section>;
}

function RevisionForm({ entry, onSaved, cancel }: { entry: StudioEntry; onSaved: (id: string, message: string) => void; cancel: () => void }) {
  const { video, private: media } = entry;
  const [draft, setDraft] = useState({ title: video.title, description: video.description, category: video.category, language: video.language, priceCents: video.priceCents, newsDate: video.newsDate, rightsStatement: media.rightsStatement });
  const [accepted, setAccepted] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [coverFile, setCoverFile] = useState<File>(); const coverId = useRef<string | undefined>(undefined);
  const requestId = useRef<string | null>(null); const requestDraft = useRef<WatchRevision['draft'] | null>(null);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const leave = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download') || link.getAttribute('href')?.startsWith('#') || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
      if (!window.confirm('Leave without submitting these changes?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn); document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', leave, true); };
  }, []);
  async function submit(event?: FormEvent) {
    event?.preventDefault(); if (busy) return;
    if (!accepted) { setError('Confirm your distribution rights first.'); return; }
    const validated = videoDraftSchema.safeParse({ ...draft, rightsAccepted: accepted });
    if (!validated.success) { setError(validated.error.issues[0].message); return; }
    requestId.current ??= crypto.randomUUID(); requestDraft.current ??= validated.data;
    setBusy(true); setPending(true); setError('');
    try {
      if (coverFile && !coverId.current) {
        const uploaded = await uploadVideoCover(video.id, coverFile);
        if (!uploaded.coverId) throw new Error('The cover could not be prepared for review.');
        coverId.current = uploaded.coverId;
      }
      await watchActionRequest('creator_revision', { id: video.id, revisionId: requestId.current, draft: requestDraft.current, ...(coverId.current ? { coverId: coverId.current } : {}) }); onSaved(video.id, 'Changes submitted for review. The current video remains available.'); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <form className="watch-revision-form" onSubmit={submit}><h3>Edit video details</h3><p className="watch-muted">Submit cover photo, title, description, category, language, price and rights changes for review. The existing video file stays available to buyers.</p>
    <fieldset disabled={busy || pending}>
      <VideoCoverInput file={coverFile} current={video.posterUrl} onChange={setCoverFile} />
      <p className="watch-muted">Your current cover stays visible until the new photo is approved.</p>
      <label>Title<input required minLength={2} maxLength={160} value={draft.title} dir="auto" onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>Description<textarea aria-label="Description" required minLength={20} maxLength={5000} rows={4} value={draft.description} dir="auto" onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <div className="watch-fields"><label>Category<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as typeof draft.category })}>{VIDEO_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label><label>Spoken language<input required minLength={2} maxLength={60} value={draft.language} onChange={e => setDraft({ ...draft, language: e.target.value })} /></label></div>
      <label>Price in USD (0 = free)<input required type="number" min="0" max="49.99" step="0.01" defaultValue={draft.priceCents / 100} onChange={e => setDraft({ ...draft, priceCents: Math.round(Number(e.target.value) * 100) })} /></label>
      <p className="watch-muted">Paid videos start at $0.99. A price change needs review and an update to the store checkout price. Existing purchases remain valid.</p>
      {draft.category === 'News & interviews' && <label>News publication date<input required type="date" value={draft.newsDate} onChange={e => setDraft({ ...draft, newsDate: e.target.value })} /></label>}
      <label>Rights declaration<textarea aria-label="Rights declaration" required minLength={30} maxLength={3000} rows={3} value={draft.rightsStatement} onChange={e => setDraft({ ...draft, rightsStatement: e.target.value })} /></label>
      <label className="watch-check"><input required type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />I own or have permission to distribute this video, its music and its cover image.</label>
      <button type="submit" className="watch-button watch-primary">Submit changes for review</button>
    </fieldset>
    {pending && !busy && <button type="button" className="watch-button" onClick={() => void submit()}>Check submitted changes</button>}
    <button type="button" className="watch-button" disabled={busy} onClick={() => { if (window.confirm(pending ? 'Close this form? Your changes may already be awaiting review; reload the video to check.' : 'Discard these unsent changes?')) cancel(); }}>Close editor</button>
    <WatchFeedback error={error} />
  </form>;
}
