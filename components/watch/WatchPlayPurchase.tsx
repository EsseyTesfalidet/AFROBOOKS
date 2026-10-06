'use client';
import { useEffect, useRef, useState } from 'react';
import { authenticatedPost } from '@/lib/firebase/request';
import type { PlayOffer } from '@/lib/watch/play';
import { buyPlayVideo, playPrice, playService, restorePlayVideos, type DigitalGoods, type PlayItem } from '@/lib/watch/playBrowser';
import { useAuthStore } from '@/store/authStore';

export function RestoreVideoPurchases({ onRestored, contentKind = 'video' }: { onRestored: () => void; contentKind?: 'video' | 'audio' }) {
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const [service, setService] = useState<DigitalGoods | null>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  useEffect(() => { let active = true; void playService().then(value => { if (active) setService(value); }); return () => { active = false; }; }, [uid]);
  if (!service || !uid) return null;
  return <div><button className="watch-button" disabled={busy} onClick={async () => {
    if (busy) return; setBusy(true); setNotice('');
    try { await restorePlayVideos(service); setNotice(`Your Google Play ${contentKind} purchases have been checked.`); onRestored(); }
    catch (error) { setNotice((error as Error).message); onRestored(); }
    finally { setBusy(false); }
  }}>{busy ? 'Checking purchases…' : 'Restore purchases'}</button>{notice && <p className="watch-notice" role="status">{notice}</p>}</div>;
}
export default function WatchPlayPurchase({ videoId, offer, onPurchased, contentKind = 'video' }: { videoId: string; offer: PlayOffer; onPurchased: () => void; contentKind?: 'video' | 'audio' }) {
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const [item, setItem] = useState<PlayItem | null>(null); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const running = useRef(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const service = await playService();
      if (!service) throw new Error(`Open the current Google Play version of AfroBooks to purchase this ${contentKind}.`);
      const details = (await service.getDetails([offer.productId])).find(row => row.itemId === offer.productId);
      if (!details) throw new Error(`This ${contentKind} is not available in Google Play for this account or country.`);
      playPrice(details);
      const prepared = await authenticatedPost<PlayOffer>('/api/watch/play', { action: 'prepare', videoId, ...(contentKind === 'audio' ? { contentKind } : {}) });
      if (prepared.accountId !== offer.accountId || prepared.productId !== offer.productId || prepared.testOnly !== offer.testOnly) throw new Error('Your checkout settings changed. Reload before purchasing.');
      if (active) { setItem(details); setError(''); }
    })().catch(failure => { if (active) setError((failure as Error).message); });
    return () => { active = false; };
  }, [uid, videoId, offer.accountId, offer.productId, offer.testOnly, contentKind]);
  return <div><button className="watch-button watch-primary" disabled={!item || busy} onClick={() => {
    if (!item || running.current) return; running.current = true; setBusy(true); setError('');
    void buyPlayVideo(offer, item).then(result => {
      if (result.status === 'active') onPurchased();
      else setError(result.status === 'pending' ? 'Payment is pending. Your video unlocks after Google confirms it. Do not pay again.' : 'This purchase has been cancelled or refunded.');
    }).catch(failure => {
      setError(failure.name === 'AbortError' ? 'Checkout was closed. Use Restore purchases if Google shows a charge.' : failure.message);
    }).finally(() => { running.current = false; setBusy(false); });
  }}>{busy ? 'Confirming purchase…' : item ? `${offer.testOnly ? 'Test purchase' : `Buy ${contentKind}`} · ${playPrice(item)}` : 'Checking Google Play…'}</button>
    <p className="watch-muted">{offer.testOnly ? 'License testing only. Select a Google test payment method.' : `One-time purchase through Google Play. ${contentKind === 'audio' ? 'Listen again from Library → Audio' : 'Watch again from Library → Videos'} without paying again while your purchase remains active.`}</p>
    {error && <p role="alert" className="watch-notice">{error}</p>}
    <RestoreVideoPurchases onRestored={onPurchased} contentKind={contentKind} />
  </div>;
}
