'use client';
import { useState, type FormEvent } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import type { WatchCreator } from '@/types/video';
import { videoReadiness } from '@/lib/watch/readiness';
import type { StudioEntry } from './WatchStudio';

export default function WatchApprovalActions({ entry, creator, busy, save }: { entry: StudioEntry; creator?: WatchCreator; busy: boolean; save: (action: string, data: unknown) => Promise<void> }) {
  const [note, setNote] = useState(''); const [error, setError] = useState('');
  const { video, private: media } = entry;
  const reasons: string[] = [];
  if (video.status === 'draft') reasons.push('The creator must open Author studio → Videos and tap Submit. A saved draft is not a submission.');
  if (video.status === 'processing') reasons.push('The video is preparing. It moves to Awaiting review automatically once the files are ready.');
  if (video.status === 'removed') reasons.push('This video was removed. Return an unpublished video to draft for corrections before it can be submitted again.');
  if (creator && creator.status !== 'approved') reasons.push('Approve this creator in Creator access below before publishing their video.');
  if (!media?.full?.ready || media?.fullPending) reasons.push(videoReadiness(media?.full, media?.fullPending, media?.processingError).message);
  if (media?.trailerPending || (media?.trailer && !media.trailer.ready)) reasons.push('The optional trailer is still preparing.');
  if (media?.captionsPending) reasons.push('A subtitle upload is still in progress.');
  if (!media?.rightsAcceptedAt) reasons.push('The creator must confirm the distribution rights before submitting.');
  const canPublish = ['in_review', 'unlisted'].includes(video.status) && reasons.length === 0;
  function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
    if (!decision || busy) return;
    if (decision !== 'published' && note.trim().length < 10) { setError('Add a review note of at least 10 characters explaining the change needed.'); return; }
    setError(''); void save('admin_review', { id: video.id, decision, note });
  }
  return <section className="watch-approval-actions" aria-label="Video approval">
    <h3>{video.status === 'published' ? 'Publication controls' : 'Approve this video'}</h3>
    {video.status !== 'published' && reasons.length > 0 && <div className="watch-notice"><strong>Before you can approve</strong><ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>{media?.processingError && <p>{media.processingError}</p>}</div>}
    {canPublish && <p className="watch-muted">Watch the preview and check the rights declaration above, then approve the video to show it in Screen.</p>}
    {video.status === 'published' && <p className="watch-notice">Published · this video is already approved.</p>}
    <form onSubmit={decide}><fieldset disabled={busy}>
      <label>Review note<textarea aria-label="Review note" value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={2} placeholder="Optional when approving; required when requesting changes or removing a video." /></label>
      <div className="watch-actions">
        {video.status !== 'published' && <button type="submit" value="published" className="watch-button watch-primary" disabled={!canPublish}><CheckCircle2 size={18} aria-hidden="true" />Approve and publish</button>}
        {['draft', 'processing', 'in_review'].includes(video.status) && <button type="button" className="watch-button" onClick={() => void save('refresh', { id: video.id })}><RefreshCw size={16} aria-hidden="true" />Refresh status</button>}
        {!video.publishedAt && <button type="submit" value="draft" className="watch-button">Request changes</button>}
      </div>
      <details className="watch-upload-options"><summary>More publication actions</summary><div className="watch-actions"><button type="submit" value="unlisted" className="watch-button">Unlist video</button><button type="submit" value="removed" className="watch-button">Remove and block access</button></div><p className="watch-muted">Unlisting preserves existing purchases. Removing blocks viewer access.</p></details>
    </fieldset></form>
    {error && <p className="watch-notice" role="alert">{error}</p>}
    {video.priceCents > 0 && <p className="watch-muted">Publishing and enabling paid checkout are separate. Use Google Play checkout below to connect this video’s store product.</p>}
  </section>;
}
