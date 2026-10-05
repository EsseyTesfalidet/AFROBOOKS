'use client';
import type { StudioEntry } from './WatchStudio';
import { videoPrice } from '@/lib/watch/policy';

export default function WatchRevisionReview({ entry, busy, save }: { entry: StudioEntry; busy: boolean; save: (action: string, data: unknown) => Promise<void> }) {
  const revision = entry.private?.pendingRevision;
  if (!revision) return null;
  const draft = revision.draft;
  const rows = [
    ['Title', entry.video.title, draft.title], ['Description', entry.video.description, draft.description],
    ['Category', entry.video.category, draft.category], ['Language', entry.video.language, draft.language],
    ['Price', videoPrice(entry.video.priceCents), videoPrice(draft.priceCents)], ['News date', entry.video.newsDate, draft.newsDate],
    ['Rights declaration', entry.private.rightsStatement, draft.rightsStatement],
  ].filter(([, current, requested]) => current !== requested);
  return <section className="watch-revision-review"><h3>Creator changes awaiting review</h3><p className="watch-muted">Approving changes keeps the current publication status. An unlisted video stays unlisted.</p>
    {rows.map(([label, current, requested]) => <div className="watch-revision-diff" key={label}><h4>{label}</h4><p dir="auto"><strong>Current:</strong> {current || 'None'}</p><p dir="auto"><strong>Requested:</strong> {requested || 'None'}</p></div>)}
    {draft.priceCents !== entry.video.priceCents && <p className="watch-notice">Approving this price change pauses new paid purchases. Update the Google Play product price, then re-enable checkout below. Existing buyers keep access.</p>}
    <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void save('admin_revision', { id: entry.video.id, revisionId: revision.id, decision: form.get('decision'), note: form.get('note') }); }}>
      <fieldset disabled={busy}><label>Changes decision<select name="decision" defaultValue="approve"><option value="approve">Approve changes</option><option value="reject">Reject changes</option></select></label><label>Changes review note<textarea name="note" maxLength={2000} rows={2} placeholder="Explain any corrections needed if rejecting." /></label><button type="submit" className="watch-button watch-primary">Review creator changes</button></fieldset>
    </form>
  </section>;
}
