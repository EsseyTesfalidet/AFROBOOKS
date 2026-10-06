'use client';
import { useState } from 'react';
import { videoMoney, type VideoEarning } from '@/lib/watch/play';
import { watchActionRequest } from './WatchUI';
import { authenticatedPost } from '@/lib/firebase/request';

export default function WatchEarnings({ entries = [], admin = false, refresh }: { entries?: VideoEarning[]; admin?: boolean; refresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState('');
  return <section className="watch-review"><h2>Video &amp; audio earnings</h2>
    <p className="watch-muted">Creators receive 80% and AfroBooks keeps 20% of the revenue Google reports after fees, taxes and refunds. These are accrued earnings. Monthly transfers and their status appear below.</p>
    {!entries.length && <p className="watch-muted">No paid media sales yet. Test purchases do not count as earnings.</p>}
    {!!entries.length && <p className="watch-muted">Showing up to 100 sales. Amounts stay in the buyer’s currency.</p>}
    {entries.map(entry => <div className="watch-review" key={entry.id}><h3 dir="auto">{entry.videoTitle}</h3>
      <p>{entry.status.replace('_', ' ')} · {entry.orderId || 'Awaiting order confirmation'}</p>
      <p>Creator: <strong>{videoMoney(entry.creatorEarningsNanos, entry.currency)}</strong>{admin && <> · AfroBooks: <strong>{videoMoney(entry.platformEarningsNanos, entry.currency)}</strong> · Google net: {videoMoney(entry.googleRevenueNanos, entry.currency)}</>}</p>
      <button className="watch-button" disabled={busy !== null} onClick={async () => {
        setBusy(entry.id); setError('');
        try { if (entry.contentKind === 'music_subscription') await authenticatedPost('/api/music', { action: 'refresh_earning', id: entry.id }); else await watchActionRequest('play_reconcile', { id: entry.id }); refresh(); }
        catch (failure) { setError((failure as Error).message); } finally { setBusy(null); }
      }}>{busy === entry.id ? 'Checking Google…' : 'Refresh sale'}</button>
    </div>)}
    {error && <p role="alert" className="watch-notice">{error}</p>}
  </section>;
}
