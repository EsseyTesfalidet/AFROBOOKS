'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { VideoPayoutOverview } from '@/lib/watch/payouts';
import { videoMoney } from '@/lib/watch/play';
import { watchActionRequest } from './WatchUI';

export default function WatchPayouts({ data, admin = false, refresh }: { data?: VideoPayoutOverview; admin?: boolean; refresh: () => void }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  async function act(action: string, input: unknown) {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await watchActionRequest(action, input); setMessage('Saved. The payout worker will check eligible transfers.'); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <section className="watch-review"><h2>Monthly video payouts</h2>
    <p className="watch-muted">Completed months are paid to your Stripe account after Google settles and AfroBooks funds the payout balance. Refunds are deducted from future earnings. Small fractions carry forward; currencies are kept separate. A transfer to Stripe is followed by Stripe’s bank payout schedule.</p>
    {!admin && <Link href="/dashboard?profile=payout" className="watch-button">Set up or manage payout account</Link>}
    {admin && <><p className="watch-muted">Add funds in Stripe after receiving Google’s payment. Register the settled top-up below to authorize automatic payouts for that month. Use the sales currency; this tool does not estimate exchange rates or debit your bank. Keep that balance available in Stripe.</p>
      <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act('payout_funding', { period: form.get('period'), topupId: form.get('topupId'), settled: form.get('settled') === 'on' }); }}>
        <div className="watch-fields"><label>Earnings month<input type="month" name="period" required /></label><label>Stripe top-up ID<input name="topupId" pattern="tu_[A-Za-z0-9]+" placeholder="tu_…" required /></label></div>
        <label className="watch-check"><input name="settled" type="checkbox" required />Google has paid this month’s proceeds, and this top-up is reserved for video creators.</label>
        <button className="watch-button" disabled={busy || data?.stripeReady === false}>Verify funding and enable payouts</button>
      </form><button className="watch-button mt-3" disabled={busy} onClick={() => void act('payout_run', {})}>Check pending payouts now</button>
      {data?.funding.map(f => <p key={f.id}>{f.period} · {f.currency} · Funded {fundingMoney(f.creditedMinor, f.currency)} · Reserved {fundingMoney(f.reservedMinor, f.currency)} · Transferred {fundingMoney(f.spentMinor, f.currency)}</p>)}
    </>}
    {!data?.payouts.length && <p className="watch-muted">No monthly transfers yet.</p>}
    {data?.payouts.map(p => <div className="watch-review" key={p.id}><strong>{p.period} · {videoMoney(p.amountNanos, p.currency)}</strong><p>{p.status === 'paid' ? 'Transferred to Stripe' : p.status.replace('_', ' ')}{admin ? ` · Creator ${p.creatorId}` : ''}</p>{p.transferId && <p>Transfer: {p.transferId}</p>}{p.notice && <p className="watch-muted">{p.notice}</p>}{admin && p.status !== 'paid' && p.status !== 'cancelled' && <button className="watch-button" disabled={busy} onClick={() => void act('payout_reconcile', { id: p.id })}>Reconcile with Stripe</button>}</div>)}
    {message && <p role="status" className="watch-notice">{message} <button className="watch-button" onClick={refresh}>Refresh payout status</button></p>}{error && <p role="alert" className="watch-notice">{error}</p>}
  </section>;
}
function fundingMoney(minor: number, currency: string) {
  const zero = ['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','VND','VUV','XAF','XOF','XPF'].includes(currency);
  const decimals = zero ? 0 : ['BHD','JOD','KWD','OMR','TND'].includes(currency) ? 3 : 2;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 10 ** decimals);
}
