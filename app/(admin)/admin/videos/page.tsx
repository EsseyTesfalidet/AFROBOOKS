'use client';
import { useEffect, useState } from 'react';
import { AdminHeading } from '@/components/admin/AdminUI';
import type { StudioEntry } from '@/components/watch/WatchStudio';
import StudioPreview from '@/components/watch/StudioPreview';
import { useWatchResource, WatchFeedback, watchActionRequest } from '@/components/watch/WatchUI';
import { videoDuration, videoPrice } from '@/lib/watch/policy';
import type { WatchCreator } from '@/types/video';
import WatchPlaySetup from '@/components/watch/WatchPlaySetup';
import WatchRevisionReview from '@/components/watch/WatchRevisionReview';
import WatchApprovalActions from '@/components/watch/WatchApprovalActions';
import WatchHostingCheck from '@/components/watch/WatchHostingCheck';
import WatchEarnings from '@/components/watch/WatchEarnings';
import type { VideoEarning } from '@/lib/watch/play';
import type { VideoPayoutOverview } from '@/lib/watch/payouts';
import WatchPayouts from '@/components/watch/WatchPayouts';
const statusLabel = (status: string) => ({ draft: 'Draft', processing: 'Preparing', in_review: 'Awaiting review', published: 'Published', unlisted: 'Unlisted', removed: 'Removed' }[status] || status);
interface AdminData { creators: WatchCreator[]; videos: StudioEntry[]; reports: { id: string; videoId: string; reason: string }[]; hostingReady: boolean; purchasesReady: boolean; earnings?: VideoEarning[]; payouts?: VideoPayoutOverview; lastNotificationTestAt?: number | null }

export default function AdminVideosPage() {
  const resource = useWatchResource<AdminData>('/api/watch?view=admin', true);
  const [filter, setFilter] = useState('all');
  const videos = (resource.data?.videos || []).filter(({ video, private: media }) => video.status !== 'removed' && !media?.creatorRemovedAt);
  const filtered = videos.filter(entry => filter === 'all' || (filter === 'changes' ? !!entry.private?.pendingRevision : entry.video.status === filter)).sort((a, b) => Number(b.video.status === 'in_review' || !!b.private?.pendingRevision) - Number(a.video.status === 'in_review' || !!a.private?.pendingRevision));
  const awaiting = videos.filter(entry => entry.video.status === 'in_review').length;
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const refreshAdmin = resource.retry;
  const pendingIds = videos.filter(({ video, private: media }) => ['draft', 'processing', 'in_review'].includes(video.status) && !!media?.full && (!media.full.ready || !!(media.trailer && !media.trailer.ready) || video.status === 'processing')).map(({ video }) => video.id).sort().join(',');
  useEffect(() => {
    if (!pendingIds || busy) return;
    let stopped = false; let checking = false; let offset = 0;
    const ids = pendingIds.split(',');
    const check = async () => {
      if (stopped || checking || document.visibilityState === 'hidden' || !navigator.onLine) return;
      checking = true;
      try { await watchActionRequest('refresh', { id: ids[offset++ % ids.length] }); if (!stopped) setError(''); }
      catch (failure) { if (!stopped) setError((failure as Error).message); }
      finally { checking = false; if (!stopped) refreshAdmin(); }
    };
    void check();
    const timer = setInterval(() => void check(), 10000);
    return () => { stopped = true; clearInterval(timer); };
  }, [pendingIds, busy, refreshAdmin]);
  async function mutate(action: string, data: unknown) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { const result = await watchActionRequest<{ priceChanged?: boolean }>(action, data); resource.retry(); setNotice(result.priceChanged ? 'Changes approved. Update the Google Play price and re-enable checkout for new purchases.' : 'Changes saved.'); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <div className="watch-admin"><AdminHeading title="AfroBooks Screen" description="Review creators, distribution rights and videos before they reach the mobile app." /><WatchFeedback loading={resource.loading} error={resource.error || error} retry={resource.retry} />{notice && <p className="watch-notice" role="status">{notice}</p>}
    {resource.data && <>
      <section className="watch-approval-guide"><h2>Video approvals</h2><p><strong>{awaiting} awaiting review</strong> in the latest 100 videos.</p><ol><li>Open a video marked <strong>Awaiting review</strong>.</li><li>Watch its preview and check the rights declaration.</li><li>Press <strong>Approve and publish</strong>.</li></ol><p className="watch-muted">Drafts need the creator to tap Submit first. Preparing videos become ready automatically.</p><button type="button" className="watch-button" disabled={busy || resource.loading} onClick={resource.retry}>Refresh list</button></section>
      <div className="watch-chips" aria-label="Filter video approvals">{[['all', 'All videos'], ['in_review', 'Awaiting review'], ['processing', 'Preparing'], ['draft', 'Drafts'], ['changes', 'Creator changes'], ['published', 'Published'], ['unlisted', 'Unlisted']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} ({videos.filter(entry => value === 'all' || (value === 'changes' ? !!entry.private?.pendingRevision : entry.video.status === value)).length})</button>)}</div>
      {!filtered.length && <p className="watch-notice">{filter === 'in_review' ? 'No videos are awaiting review. Check Preparing or Drafts to see what is still needed.' : 'No videos match this filter.'}</p>}
      {filtered.map(entry => <details className="watch-review" key={entry.video.id}><summary><span dir="auto">{entry.video.title}</span><span className="watch-status-badge" data-status={entry.video.status}>{statusLabel(entry.video.status)}</span>{entry.private?.pendingRevision && <span className="watch-status-badge">Changes awaiting review</span>}<span className="watch-review-cue">Open review ↓</span></summary><p>{entry.video.creatorName} · {entry.video.language} · {videoDuration(entry.video.durationSeconds)} · {videoPrice(entry.video.priceCents)}</p><p className="watch-description">{entry.video.description}</p><StudioPreview id={entry.video.id} title={entry.video.title} poster={entry.video.posterUrl} ready={!!entry.private?.full?.ready} asset={entry.private?.full} pending={entry.private?.fullPending} processingError={entry.private?.processingError} />{entry.private?.trailer && <details className="watch-upload-options"><summary>Preview optional trailer</summary><StudioPreview id={entry.video.id} title={entry.video.title} poster={entry.video.posterUrl} ready={entry.private.trailer.ready} asset={entry.private.trailer} pending={entry.private.trailerPending} trailer /></details>}<h3 className="font-semibold mt-5">Rights declaration</h3><p className="watch-description">{entry.private?.rightsStatement || 'Missing'}</p><WatchApprovalActions entry={entry} creator={resource.data?.creators.find(creator => creator.uid === entry.video.creatorId)} busy={busy} save={mutate} /><WatchRevisionReview entry={entry} busy={busy} save={mutate} /><WatchPlaySetup entry={entry} busy={busy} save={mutate} /></details>)}
      <details className="watch-review"><summary>Hosting and checkout setup</summary><WatchHostingCheck /><p>Hosting: {resource.data.hostingReady ? 'Configured — verify uploads and private playback before launch.' : 'Not configured. Add the Cloudflare Stream account ID and API token in server environment settings.'}</p><p>Video checkout: {resource.data.purchasesReady ? 'Ready to connect published videos to active Play products.' : 'Finish Google Play verification and purchase notifications before enabling sales.'} Net revenue: 80% creator / 20% AfroBooks. Book fees are unchanged.</p><p>Notification test: {resource.data.lastNotificationTestAt ? `Received ${new Date(resource.data.lastNotificationTestAt).toLocaleString()}.` : 'Not received yet. Save the topic in Play Console and send a test notification.'}</p><p>Reserved upload minutes: {Math.ceil(resource.data.creators.reduce((sum, creator) => sum + creator.reservedSeconds, 0) / 60)}. Check actual storage and delivery usage in your hosting account.</p></details>
      <h2 className="text-xl font-semibold mt-8">Creator access</h2>
      {!resource.data.creators.length && <p className="watch-muted my-4">No video creator applications yet.</p>}
      {resource.data.creators.map(creator => <form className="watch-review" key={creator.uid} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate('admin_creator', { uid: creator.uid, status: form.get('status'), allowanceSeconds: Math.round(Number(form.get('minutes')) * 60) }); }}><h2>{creator.name}</h2><p className="watch-muted">{creator.status} · {Math.ceil(creator.reservedSeconds / 60)} minutes reserved</p><div className="watch-fields"><label>Access<select name="status" defaultValue={creator.status === 'approved' ? 'approved' : 'paused'}><option value="approved">Approved to upload</option><option value="paused">Uploads paused</option></select></label><label>Total upload allowance (minutes)<input name="minutes" type="number" min={Math.ceil(creator.reservedSeconds / 60)} max={600} defaultValue={Math.ceil(creator.allowanceSeconds / 60)} required /></label></div><button className="watch-button" disabled={busy}>Save creator settings</button></form>)}
      <WatchEarnings entries={resource.data.earnings} admin refresh={resource.retry} /><WatchPayouts data={resource.data.payouts} admin refresh={resource.retry} />
      <h2 className="text-xl font-semibold mt-8">Viewer reports</h2>{!resource.data.reports.length && <p className="watch-muted my-4">No open reports.</p>}{resource.data.reports.map(report => <div className="watch-review" key={report.id}><h2>Video: {resource.data?.videos.find(entry => entry.video.id === report.videoId)?.video.title || report.videoId}</h2><p className="watch-description">{report.reason}</p><button className="watch-button mt-4" disabled={busy} onClick={() => void mutate('admin_resolve', { id: report.id })}>Mark report reviewed</button></div>)}
    </>}
  </div>;
}
