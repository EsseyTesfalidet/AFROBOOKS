'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Headphones } from 'lucide-react';
import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';
import { authenticatedGet, authenticatedPost } from '@/lib/firebase/request';
import { useAuthStore } from '@/store/authStore';
import { useWatchResource } from '@/components/watch/WatchUI';
import SellerHeader from '@/components/seller/SellerHeader';
import { AUDIO_CATEGORIES, type AudioEntry, type AudioTitle } from '@/types/audio';
import { AUDIO_MAX_BYTES, audioTime } from '@/lib/audio/policy';
import type { AudioPlayback } from '@/store/audioStore';
import WatchEarnings from '@/components/watch/WatchEarnings';
import WatchPayouts from '@/components/watch/WatchPayouts';
import type { VideoEarning } from '@/lib/watch/play';
import type { VideoPayoutOverview } from '@/lib/watch/payouts';
import { MusicAdmin } from './MusicPass';
import './listen.css';

const action = <T,>(name: string, data: unknown) => authenticatedPost<T>('/api/audio', { action: name, data });
export async function audioFileDuration(file: File) {
  if (!file.name.toLowerCase().endsWith('.mp3') || file.size < 128 || file.size > AUDIO_MAX_BYTES) throw new Error('Choose an MP3 file up to 250 MB.');
  return new Promise<number>((resolve, reject) => {
    const audio = new Audio(); const url = URL.createObjectURL(file);
    const cleanup = () => { audio.onloadedmetadata = null; audio.onerror = null; clearTimeout(timer); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Unable to read the audio. Export a new MP3 and try again.')); }, 15000);
    audio.onloadedmetadata = () => { const duration = audio.duration; cleanup(); if (Number.isFinite(duration) && duration > 0 && duration <= 172800) resolve(duration); else reject(new Error('This file has no readable audio duration. Export it as MP3 and try again.')); };
    audio.onerror = () => { cleanup(); reject(new Error('Your browser could not read this MP3.')); }; audio.src = url;
  });
}
function Editor({ title, done, cancel }: { title?: AudioTitle; done: () => void; cancel: () => void }) {
  const [category, setCategory] = useState(title?.category || 'Music');
  const [id, setId] = useState(title?.id || ''); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState<number | null>(null); const [error, setError] = useState('');
  const task = useRef<UploadTask | null>(null); const form = useRef<HTMLFormElement>(null);
  useEffect(() => () => { task.current?.cancel(); }, []);
  useEffect(() => { if (!busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [busy]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const data = new FormData(event.currentTarget); const draft = { title: data.get('title'), description: data.get('description'), category: data.get('category'), language: data.get('language'), priceCents: category === 'Music' ? 0 : Math.round(Number(data.get('price')) * 100), musicSubscription: category === 'Music' && data.get('musicSubscription') === 'on', rightsAccepted: data.get('rights') === 'on' };
      const duration = file ? await audioFileDuration(file) : null;
      if (!id && !file) throw new Error('Choose an MP3 to upload.');
      let draftId = id;
      if (draftId) await action('edit', { ...draft, id: draftId });
      else { const created = await action<{ id: string }>('create', draft); draftId = created.id; setId(draftId); }
      if (file && duration) {
        const uid = useAuthStore.getState().firebaseUser?.uid; if (!uid) throw new Error('Please sign in again.');
        task.current = uploadBytesResumable(ref(storage, `audio/${uid}/${draftId}/source.mp3`), file, { contentType: 'audio/mpeg' });
        await new Promise<void>((resolve, reject) => { task.current!.on('state_changed', snapshot => setProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, resolve); });
        await action('finish', { id: draftId, durationSeconds: duration });
      }
      done();
    } catch (failure) { setError((failure as Error).message); } finally { task.current = null; setBusy(false); setProgress(null); }
  }
  return <form ref={form} className="listen-studio-form" onSubmit={save}><h2>{title ? 'Edit audio' : 'Upload audio'}</h2><p className="listen-muted">Music, podcast episodes and audiobooks. MP3, up to 250 MB per title. Free or a one-time purchase.</p>
    <label>Title<input name="title" defaultValue={title?.title} required minLength={2} maxLength={160} disabled={busy} /></label>
    <label>Format<select name="category" aria-label="Format" value={category} onChange={event => setCategory(event.target.value as typeof category)} disabled={busy}>{AUDIO_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
    <label>Language<input name="language" defaultValue={title?.language || ''} placeholder="For example, Tigrinya" minLength={2} maxLength={60} required disabled={busy} /></label>
    <label>Description<textarea name="description" defaultValue={title?.description} minLength={10} maxLength={4000} required disabled={busy} /></label>
    {category === 'Music' ? <label><input type="checkbox" name="musicSubscription" defaultChecked={title?.musicSubscription} disabled={busy} />Include this music in the monthly Music pass. Leave unchecked for free listening.</label> : <label>Price in USD<input name="price" type="number" min="0" max="99.99" step="0.01" defaultValue={(title?.priceCents || 0) / 100} required disabled={busy} /><small>0 = free. Paid audio starts at $0.99. Google Play sets the local checkout price after admin setup.</small></label>}
    {category === 'Music' && <p className="listen-muted">Participating artists share 80% of each subscriber’s verified revenue after Google fees and taxes, based on the artists they listen to. AfroBooks keeps 20%. Earnings are allocated after the billing cycle and paid through the monthly payout system.</p>}
    {!title?.ready && <label>MP3 file<input type="file" accept=".mp3,audio/mpeg" disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)} /></label>}
    {title?.ready && <p className="listen-muted">Your original audio is ready. To replace the recording, remove this draft and upload a new title.</p>}
    <label><input type="checkbox" name="rights" required disabled={busy} defaultChecked={!!title} />I own this recording or have permission to distribute and sell it, including its music, narration and artwork.</label>
    {progress !== null && <div role="status"><progress max="100" value={progress} /> {progress}% uploaded</div>}{error && <p role="alert">{error}</p>}
    <div className="listen-studio-actions"><button className="watch-button watch-primary" disabled={busy}>{busy ? 'Saving audio…' : 'Save draft'}</button><button type="button" className="watch-button" disabled={busy} onClick={cancel}>Close</button>{busy && progress !== null && <button type="button" className="watch-button" onClick={() => task.current?.cancel()}>Cancel upload</button>}
    {id && !title?.ready && <button type="button" className="watch-button" disabled={busy || !file} onClick={async () => { setBusy(true); setError(''); try { await action('finish', { id, durationSeconds: await audioFileDuration(file!) }); done(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>Recover completed upload</button>}</div>
    {id && !title?.ready && <p className="listen-muted">If upload reached 100% but saving failed, reselect the same file and choose Recover completed upload.</p>}
  </form>;
}
function StudioRow({ title, admin, refresh, edit }: { title: AudioTitle; admin: boolean; refresh: () => void; edit: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [source, setSource] = useState(''); const [confirmRemove, setConfirmRemove] = useState(false); const uid = useAuthStore(s => s.firebaseUser?.uid);
  async function act(name: string, data: unknown = {}) { setBusy(true); setError(''); try { await action(name, { id: title.id, ...(data as object) }); refresh(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  return <article className="listen-studio-title"><p className="listen-eyebrow">{title.category} · {title.status.replace('_', ' ')}</p><h2 dir="auto">{title.title}</h2><p className="listen-muted">{title.creatorName} · {title.language} · {audioTime(title.durationSeconds)} · {title.musicSubscription ? 'Music pass' : title.priceCents ? `$${(title.priceCents / 100).toFixed(2)} USD` : 'Free'}</p><p dir="auto">{title.description}</p>{title.reviewNote && <p className="listen-notice">Review: {title.reviewNote}</p>}
    {source && <audio key={uid} src={source} controls preload="metadata" onPlay={event => document.querySelectorAll('audio').forEach(node => { if (node !== event.currentTarget) node.pause(); })} />}
    <div className="listen-studio-actions">{title.ready && <button className="watch-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await authenticatedGet<AudioPlayback>(`/api/audio?view=playback&id=${title.id}`); if (useAuthStore.getState().firebaseUser?.uid === uid) setSource(result.url); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>Preview audio</button>}
      {!admin && <>{title.status === 'draft' ? <><button className="watch-button" disabled={busy} onClick={edit}>Edit</button><button className="watch-button watch-primary" disabled={busy || !title.ready} onClick={() => void act('submit')}>Submit for review</button></> : <button className="watch-button" disabled={busy} onClick={() => void act('withdraw')}>Withdraw to edit</button>}<button className="watch-button" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove</button></>}
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
  return <>{!admin && <SellerHeader />}<main className="listen-page app-page"><header className="listen-heading"><div><p className="listen-eyebrow">{admin ? 'Review & publishing' : 'Creator studio'}</p><h1>{admin ? 'Audio' : 'Audio Studio'}</h1><p>Music, podcasts and audiobooks.</p></div><Headphones size={34} /></header>{!admin && <Link className="watch-button" href="/listen">Back to Listen</Link>}
    {admin && <MusicAdmin />}
    {!admin && !editing && <button className="watch-button watch-primary" onClick={() => setEditing('new')}>Upload audio</button>}
    {editing && <Editor key={editing === 'new' ? 'new' : editing.id} title={editing === 'new' ? undefined : editing} cancel={() => { setEditing(null); refresh(); }} done={() => { setEditing(null); refresh(); }} />}
    {resource.loading && <p role="status">Loading audio…</p>}{(resource.error || error) && <p role="alert">{resource.error || error} <button onClick={refresh}>Retry</button></p>}
    {!editing && [...(resource.data?.entries || []), ...extra].map(({ title }) => <StudioRow key={`${title.id}:${title.updatedAt}`} title={title} admin={admin} refresh={refresh} edit={() => setEditing(title)} />)}
    {resource.data && !resource.data.entries.length && !extra.length && <p className="listen-empty">{admin ? 'No audio submissions yet.' : 'Your uploads will appear here. Save a draft, preview it, then submit it for approval.'}</p>}
    {next && !editing && <button className="watch-button" onClick={async () => { try { const page = await authenticatedGet<{ entries: AudioEntry[]; next: string | null }>(`/api/audio?view=${admin ? 'admin' : 'studio'}&after=${next}`); setExtra(old => [...old, ...page.entries]); setCursor(page.next); } catch (failure) { setError((failure as Error).message); } }}>Load more</button>}
    {!editing && finances.data && <><WatchEarnings entries={finances.data.earnings} admin={admin} refresh={finances.retry} /><WatchPayouts data={finances.data.payouts} admin={admin} refresh={finances.retry} /></>}
  </main></>;
}
export default function AudioStudio({ admin = false }: { admin?: boolean }) { const uid = useAuthStore(s => s.firebaseUser?.uid); return <Studio key={uid} admin={admin} />; }
