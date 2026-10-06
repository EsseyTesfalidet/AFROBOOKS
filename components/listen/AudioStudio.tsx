'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Headphones } from 'lucide-react';
import { authenticatedGet, authenticatedPost } from '@/lib/firebase/request';
import { useAuthStore } from '@/store/authStore';
import { useWatchResource } from '@/components/watch/WatchUI';
import SellerHeader from '@/components/seller/SellerHeader';
import { type AudioEntry, type AudioTitle } from '@/types/audio';
import { audioTime, audioTracks } from '@/lib/audio/policy';
import type { AudioPlayback } from '@/store/audioStore';
import WatchEarnings from '@/components/watch/WatchEarnings';
import WatchPayouts from '@/components/watch/WatchPayouts';
import type { VideoEarning } from '@/lib/watch/play';
import type { VideoPayoutOverview } from '@/lib/watch/payouts';
import { MusicAdmin } from './MusicPass';
import AudioEditor from './AudioEditor';
import AudioArtwork from './AudioArtwork';
import { prepareAudioSample } from './audioRequests';
import './listen.css';

const action = <T,>(name: string, data: unknown) => authenticatedPost<T>('/api/audio', { action: name, data });
function StudioRow({ title, admin, refresh, edit }: { title: AudioTitle; admin: boolean; refresh: () => void; edit: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [source, setSource] = useState(''); const [confirmRemove, setConfirmRemove] = useState(false); const uid = useAuthStore(s => s.firebaseUser?.uid);
  async function act(name: string, data: unknown = {}) { setBusy(true); setError(''); try { await action(name, { id: title.id, ...(data as object) }); refresh(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  return <article className="listen-studio-title">{title.coverUrl && <AudioArtwork category={title.category} coverUrl={title.coverUrl} />}<p className="listen-eyebrow">{title.category} · {title.status.replace('_', ' ')}</p><h2 dir="auto">{title.title}</h2><p className="listen-muted">{title.creatorName} · {title.language} · {audioTime(title.durationSeconds)} · {title.musicSubscription ? 'Music pass' : title.priceCents ? `$${(title.priceCents / 100).toFixed(2)} USD` : 'Free'}</p><p dir="auto">{title.description}</p>{title.reviewNote && <p className="listen-notice">Review: {title.reviewNote}</p>}
    {source && <audio key={uid} src={source} controls preload="metadata" onPlay={event => document.querySelectorAll('audio').forEach(node => { if (node !== event.currentTarget) node.pause(); })} />}
    {source && audioTracks(title).length > 1 && <div className="listen-track-list" aria-label="Preview recordings">{audioTracks(title).map(track => <button className="watch-button" key={track.id} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await authenticatedGet<AudioPlayback>(`/api/audio?view=playback&id=${title.id}&position=${track.startSeconds}`); if (useAuthStore.getState().firebaseUser?.uid === uid) setSource(result.url); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>{track.title} · {audioTime(track.durationSeconds)}</button>)}</div>}
    {title.ready && <div className="listen-studio-actions"><button className="watch-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { if (!title.previewReady) { await prepareAudioSample(title.id); refresh(); } else { const result = await authenticatedGet<AudioPlayback>(`/api/audio?view=preview&id=${title.id}`); if (useAuthStore.getState().firebaseUser?.uid === uid) setSource(result.url); } } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>{title.previewReady ? 'Play free sample' : 'Prepare free sample'}</button></div>}
    <div className="listen-studio-actions">{title.ready && <button className="watch-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await authenticatedGet<AudioPlayback>(`/api/audio?view=playback&id=${title.id}&position=0`); if (useAuthStore.getState().firebaseUser?.uid === uid) setSource(result.url); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>Preview audio</button>}
      {!admin && <>{title.status === 'draft' ? <><button className="watch-button" disabled={busy} onClick={edit}>Edit</button><button className="watch-button watch-primary" disabled={busy || !title.ready || title.parts?.some(part => !part.ready)} onClick={() => void act('submit')}>Submit for review</button></> : <button className="watch-button" disabled={busy} onClick={() => void act('withdraw')}>Withdraw to edit</button>}<button className="watch-button" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove</button></>}
      {admin && title.status === 'in_review' && <button className="watch-button watch-primary" disabled={busy} onClick={() => void act('review', { publish: true })}>Approve and publish</button>}
      {admin && title.status === 'published' && <button className="watch-button" disabled={busy} onClick={() => void act('hide')}>Unpublish</button>}
    </div>{confirmRemove && <div className="listen-notice"><p>Remove this audio and its original file? It will stop appearing in Listen.</p><button className="watch-button" disabled={busy} onClick={() => void act('remove')}>Confirm removal</button><button className="watch-button" onClick={() => setConfirmRemove(false)}>Keep audio</button></div>}
    {admin && title.status === 'in_review' && <form className="listen-studio-form" onSubmit={event => { event.preventDefault(); void act('review', { publish: false, note: new FormData(event.currentTarget).get('note') }); }}><label>Requested changes<textarea name="note" required maxLength={1000} /></label><button className="watch-button" disabled={busy}>Return to creator</button></form>}
    {admin && title.priceCents > 0 && <details><summary>Google Play checkout setup</summary><form className="listen-studio-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void act('product', { productId: data.get('productId'), enabled: data.get('test') === 'on', liveEnabled: data.get('live') === 'on' }); }}><p className="listen-muted">Create a one-time product in Play Console with this title’s price, then link it here. Use one standard buy option. Configure checkout before announcing paid audio.</p><label>Product ID<input name="productId" pattern="afrobooks_audio_[a-z0-9_]{1,100}" placeholder="afrobooks_audio_your_title" required /></label><label><input name="test" type="checkbox" />Enable license testing</label><label><input name="live" type="checkbox" />Enable real purchases after Play verification</label><button className="watch-button" disabled={busy}>Save checkout settings</button></form></details>}
    {error && <p role="alert">{error}</p>}
  </article>;
}
function Studio({ admin }: { admin: boolean }) {
  const resource = useWatchResource<{ entries: AudioEntry[]; next: string | null }>(`/api/audio?view=${admin ? 'admin' : 'studio'}`);
  const finances = useWatchResource<{ earnings: VideoEarning[]; payouts: VideoPayoutOverview }>('/api/audio?view=finances');
  const [editing, setEditing] = useState<AudioTitle | 'new' | null>(null); const [extra, setExtra] = useState<AudioEntry[]>([]); const [cursor, setCursor] = useState<string | null | undefined>(); const [error, setError] = useState('');
  const refresh = () => { setExtra([]); setCursor(undefined); resource.retry(); };
  const next = cursor === undefined ? resource.data?.next : cursor;
  return <>{!admin && <SellerHeader />}<main className="listen-page listen-studio-page app-page"><header className="listen-heading"><div><p className="listen-eyebrow">{admin ? 'Review & publishing' : 'Creator studio'}</p><h1>{admin ? 'Audio' : 'Audio Studio'}</h1><p>Music, podcasts and audiobooks.</p></div><Headphones size={34} /></header>
    {admin && <MusicAdmin />}
    {!admin && <div className="listen-studio-toolbar"><Link className="watch-button" href="/listen">Back to Listen</Link>{!editing && <button className="watch-button watch-primary" onClick={() => setEditing('new')}>Upload audio</button>}</div>}
    {editing && <AudioEditor key={editing === 'new' ? 'new' : editing.id} title={editing === 'new' ? undefined : editing} cancel={() => { setEditing(null); refresh(); }} done={() => { setEditing(null); refresh(); }} />}
    {resource.loading && <p role="status">Loading audio…</p>}{(resource.error || error) && <p role="alert">{resource.error || error} <button onClick={refresh}>Retry</button></p>}
    {!editing && [...(resource.data?.entries || []), ...extra].map(({ title }) => <StudioRow key={`${title.id}:${title.updatedAt}`} title={title} admin={admin} refresh={refresh} edit={() => setEditing(title)} />)}
    {resource.data && !resource.data.entries.length && !extra.length && <p className="listen-empty">{admin ? 'No audio submissions yet.' : 'Your uploads will appear here. Save a draft, preview it, then submit it for approval.'}</p>}
    {next && !editing && <button className="watch-button" onClick={async () => { try { const page = await authenticatedGet<{ entries: AudioEntry[]; next: string | null }>(`/api/audio?view=${admin ? 'admin' : 'studio'}&after=${next}`); setExtra(old => [...old, ...page.entries]); setCursor(page.next); } catch (failure) { setError((failure as Error).message); } }}>Load more</button>}
    {!editing && finances.data && <><WatchEarnings entries={finances.data.earnings} admin={admin} refresh={finances.retry} /><WatchPayouts data={finances.data.payouts} admin={admin} refresh={finances.retry} /></>}
  </main></>;
}
export default function AudioStudio({ admin = false }: { admin?: boolean }) { const uid = useAuthStore(s => s.firebaseUser?.uid); return <Studio key={uid} admin={admin} />; }
