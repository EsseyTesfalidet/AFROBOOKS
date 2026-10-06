'use client';
import { useEffect, useState } from 'react';
import { authenticatedPost } from '@/lib/firebase/request';
import { useWatchResource } from '@/components/watch/WatchUI';
import { playService, playPrice, type PlayItem } from '@/lib/watch/playBrowser';
import { PLAY_METHOD, PLAY_PACKAGE, videoMoney } from '@/lib/watch/play';
import { MUSIC_PRODUCT } from '@/lib/music/policy';
interface Status { active: boolean; expiresAt: number; autoRenew: boolean; available: boolean; testOnly: boolean; productId: string; accountId: string }
export default function MusicPass({ onChanged }: { onChanged?: () => void }) {
  const resource = useWatchResource<Status>('/api/music'); const [item, setItem] = useState<PlayItem | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const status = resource.data;
  useEffect(() => { let active = true;
    if (status?.available && !status.active) void (async () => { const service = await playService(); if (!service) return; const value = (await service.getDetails([MUSIC_PRODUCT])).find(row => row.itemId === MUSIC_PRODUCT); if (value) { playPrice(value); const prepared = await authenticatedPost<Status>('/api/music', { action: 'prepare' }); if (prepared.accountId !== status.accountId || prepared.testOnly !== status.testOnly) throw new Error('Your subscription settings changed. Refresh before subscribing.'); if (active) setItem(value); } })().catch(failure => { if (active) setError((failure as Error).message); });
    return () => { active = false; setItem(null); };
  }, [status?.available, status?.active, status?.accountId, status?.testOnly]);
  const changed = () => { resource.retry(); onChanged?.(); };
  async function buy() {
    if (!item || !status || busy) return; setBusy(true); setError('');
    let response: PaymentResponse | undefined;
    try {
      const request = new PaymentRequest([{ supportedMethods: PLAY_METHOD, data: { sku: MUSIC_PRODUCT, obfuscatedAccountId: status.accountId } }], { total: { label: 'AfroBooks Music · monthly', amount: item.price } });
      response = await request.show(); const token = (response.details as { purchaseToken?: string }).purchaseToken;
      if (!token) throw new Error('Google did not return a purchase. Restore before trying to pay again.');
      const result = await authenticatedPost<{ active: boolean }>('/api/music', { action: 'verify', purchaseToken: token });
      await response.complete(result.active ? 'success' : 'unknown'); response = undefined; changed();
      if (!result.active) setError('Your subscription is not active yet. Restore it after Google confirms payment; do not pay again.');
    } catch (failure) { if (response) try { await response.complete('unknown'); } catch {} setError((failure as Error).name === 'AbortError' ? 'Checkout closed. Restore if Google shows a charge.' : (failure as Error).message); }
    finally { setBusy(false); }
  }
  async function restore() {
    setBusy(true); setError('');
    try { const service = await playService(); if (service) for (const purchase of await service.listPurchases()) if (purchase.itemId === MUSIC_PRODUCT) await authenticatedPost('/api/music', { action: 'verify', purchaseToken: purchase.purchaseToken }); await authenticatedPost('/api/music', { action: 'restore' }); changed(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <section className="listen-pass"><div><p className="listen-eyebrow">AfroBooks Music</p><h2>One pass. More voices.</h2><p>All participating music in one monthly subscription.</p></div>
    {status?.active ? <><strong>Music pass active</strong><p>{status.autoRenew ? 'Next renewal' : 'Access until'}: {new Date(status.expiresAt).toLocaleDateString()}</p><a className="watch-button" href={`https://play.google.com/store/account/subscriptions?sku=${MUSIC_PRODUCT}&package=${PLAY_PACKAGE}`} target="_blank" rel="noopener noreferrer">Manage or cancel subscription</a></> : status?.available ? <><button className="watch-button watch-primary" disabled={!item || busy} onClick={() => void buy()}>{busy ? 'Confirming…' : item ? `${status.testOnly ? 'Test subscription' : 'Subscribe'} · ${playPrice(item)}/month` : 'Open the Google Play app to subscribe'}</button><p>Renews monthly until cancelled in Google Play. Access continues until the paid period ends. Podcasts and audiobooks sold separately are not included.</p></> : <p>Music subscriptions are coming soon. Free recordings are available now.</p>}
    <button className="watch-button" disabled={busy} onClick={() => void restore()}>Restore music subscription</button>{(error || resource.error) && <p role="alert">{error || resource.error}</p>}
  </section>;
}
export function MusicAdmin() {
  const resource = useWatchResource<{ settings: { testEnabled: boolean; liveEnabled: boolean }; orders: { id: string; currency: string | null; status: string; creatorPool: string | null; allocated: boolean; cycleEndsAt: number }[] }>('/api/music?view=admin');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function save(action: string, data?: unknown) { setBusy(true); setMessage(''); try { const result = await authenticatedPost<{ failed?: number }>('/api/music', { action, data }); setMessage(action === 'settings' ? 'Music subscription settings saved.' : result.failed ? `${result.failed} checks need retrying. Unverified earnings remain held.` : 'Music subscriptions and earnings checked.'); resource.retry(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  return <details className="listen-studio-title"><summary>Music subscription setup &amp; earnings</summary><p>One subscription for all participating music. Suggested starting price: $2.99 USD/month with local Play pricing.</p><p>In Play Console, create subscription <strong>{MUSIC_PRODUCT}</strong> with one auto-renewing base plan named <strong>monthly</strong>, billed every month. Test purchases before enabling live sales.</p><form key={JSON.stringify(resource.data?.settings)} className="listen-studio-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void save('settings', { testEnabled: data.get('test') === 'on', liveEnabled: data.get('live') === 'on' }); }}><label><input name="test" type="checkbox" defaultChecked={resource.data?.settings?.testEnabled} />Enable license testing</label><label><input name="live" type="checkbox" defaultChecked={resource.data?.settings?.liveEnabled} />Enable live subscriptions after Play setup</label><button className="watch-button" disabled={busy}>Save music settings</button></form><p>80% of verified net revenue supports the artists each subscriber listens to, divided by listening time after their billing cycle ends. The 20% platform share covers operations. Cycles with no qualifying listening stay held for review.</p><button className="watch-button" disabled={busy} onClick={() => void save('reconcile')}>Check subscriptions and earnings</button>{message && <p role="status">{message}</p>}{resource.error && <p role="alert">{resource.error}</p>}{resource.data?.orders?.map(order => <p key={order.id}>Cycle ending {new Date(order.cycleEndsAt).toLocaleDateString()} · Creator pool: {videoMoney(order.creatorPool, order.currency)} · {order.status.replaceAll('_', ' ')} · {order.allocated ? 'Allocated to artists' : 'Held until cycle close, verification and qualifying listening'}</p>)}</details>;
}
