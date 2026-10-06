'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Headphones, Play, Bookmark, Search } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { useAuthStore } from '@/store/authStore';
import { useAudioStore, type AudioPlayback } from '@/store/audioStore';
import { authenticatedGet, authenticatedPost } from '@/lib/firebase/request';
import { AUDIO_CATEGORIES, type AudioEntry, type AudioTitle } from '@/types/audio';
import { audioTime, audioTracks } from '@/lib/audio/policy';
import { LibraryFormatTabs, useWatchResource, WatchSheet } from '@/components/watch/WatchUI';
import WatchPlayPurchase, { RestoreVideoPurchases } from '@/components/watch/WatchPlayPurchase';
import type { PlayOffer } from '@/lib/watch/play';
import MusicPass from './MusicPass';
import AudioArtwork from './AudioArtwork';
import './listen.css';
interface Page { entries: AudioEntry[]; next: string | null; limited?: boolean }
interface Detail { title: AudioTitle; canPlay: boolean; offer: PlayOffer | null }

function Catalog({ library = false }: { library?: boolean }) {
  const resource = useWatchResource<Page>(`/api/audio?view=${library ? 'library' : 'catalog'}`); const uid = useAuthStore(s => s.firebaseUser?.uid);
  const [extra, setExtra] = useState<AudioEntry[]>([]); const [cursor, setCursor] = useState<string | null | undefined>();
  const [category, setCategory] = useState('All'); const [search, setSearch] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null); const [notice, setNotice] = useState('');
  const entries = [...(resource.data?.entries || []), ...extra]; const next = cursor === undefined ? resource.data?.next : cursor;
  const filtered = entries.filter(({ title }) => (category === 'All' || title.category === category) && `${title.title} ${title.creatorName} ${title.language}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  async function open(id: string) {
    if (busy) return; setBusy(true); setError('');
    try { const result = await authenticatedGet<Detail>(`/api/audio?view=detail&id=${id}`); if (useAuthStore.getState().firebaseUser?.uid === uid) setDetail(result); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function play(preview = false, position?: number) {
    if (!detail || !uid || busy) return; setBusy(true); setError('');
    try { const playback = await authenticatedGet<AudioPlayback>(`/api/audio?view=${preview ? 'preview' : 'playback'}&id=${detail.title.id}${position === undefined ? '' : `&position=${position}`}`); if (useAuthStore.getState().firebaseUser?.uid === uid) { useAudioStore.getState().set(playback, uid); setDetail(null); } }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <><BuyerHeader /><main className="listen-page app-page"><header className="listen-heading"><div><p className="listen-eyebrow">AfroBooks</p><h1>{library ? 'Your library' : 'Listen'}</h1><p>{library ? 'Your audio, ready when you are.' : 'Music. Conversations. Stories told aloud.'}</p></div><Headphones size={36} /></header>
    {library ? <LibraryFormatTabs active="audio" /> : <section className="listen-hero"><span className="listen-hero-mark" aria-hidden="true"><Headphones size={70} strokeWidth={1} /></span><p>Find your next favourite voice.</p><span>Discover African music, podcasts and audiobooks.</span></section>}
    <label className="listen-search"><Search size={19} /><input id="listen-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search audio, creators or languages" aria-label="Search loaded audio" /></label>
    <div className="listen-chips" aria-label="Audio categories">{['All', ...AUDIO_CATEGORIES].map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    {(category === 'Music' || library) && <MusicPass onChanged={resource.retry} />}
    {(error || resource.error) && <p role="alert" className="listen-notice">{error || resource.error} <button onClick={resource.retry}>Retry</button></p>}{notice && <p role="status">{notice}</p>}
    {resource.loading && <p role="status">Loading audio…</p>}
    <div className="listen-list">{filtered.map(({ title, seconds, owned }) => <article className="listen-card" key={title.id}><button className="listen-card-open" disabled={busy} onClick={() => void open(title.id)}><AudioArtwork category={title.category} coverUrl={title.coverUrl} /><span><small>{title.category} · {title.language}</small><strong dir="auto">{title.title}</strong><span dir="auto">{title.creatorName}</span><small>{audioTime(title.durationSeconds)} · {owned ? 'Purchased' : title.musicSubscription ? 'Music pass' : title.priceCents ? `$${(title.priceCents / 100).toFixed(2)} USD` : 'Free'}{seconds > 0 ? ` · ${audioTime(seconds)} played` : ''}</small></span><Play size={20} /></button><button className="listen-round" aria-label={`Save ${title.title}`} onClick={async () => { try { await authenticatedPost('/api/audio', { action: 'save', data: { id: title.id, saved: true } }); setNotice('Saved to Library → Audio.'); } catch (failure) { setError((failure as Error).message); } }}><Bookmark size={18} /></button></article>)}</div>
    {resource.data && !filtered.length && <section className="listen-empty"><Headphones size={42} /><h2>{entries.length ? 'No matching audio' : library ? 'Make room for your favourites' : 'A new home for African audio'}</h2><p>{entries.length ? 'Try another category or search.' : library ? 'Save a title or start listening to find it here.' : 'Approved music, podcasts and audiobooks will appear here.'}</p>{library && <Link href="/listen">Explore Listen</Link>}</section>}
    {next && <button className="watch-button" disabled={busy} onClick={async () => { setBusy(true); try { const page = await authenticatedGet<Page>(`/api/audio?after=${next}`); setExtra(old => [...old, ...page.entries]); setCursor(page.next); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>Load more audio</button>}
    {resource.data?.limited && <p>Showing your 100 most recent listening entries and purchases.</p>}
    {entries.length > 0 && <p className="listen-muted">Search filters the titles loaded so far. Paid audio uses Google Play’s local checkout price.</p>}
    {library && <RestoreVideoPurchases onRestored={resource.retry} contentKind="audio" />}
    {detail && <WatchSheet title={detail.title.title} close={() => setDetail(null)}><div className="listen-detail"><AudioArtwork category={detail.title.category} coverUrl={detail.title.coverUrl} /><p>{detail.title.creatorName} · {audioTime(detail.title.durationSeconds)}</p><p dir="auto" className="listen-description">{detail.title.description}</p>{detail.title.previewReady && <button className="watch-button" disabled={busy} onClick={() => void play(true)}><Play size={18} />Free sample · {audioTime(detail.title.previewSeconds || 60)}</button>}{audioTracks(detail.title).length > 1 && <p className="listen-muted">{audioTracks(detail.title).length} recordings included. {detail.title.priceCents > 0 ? 'One purchase unlocks every part.' : 'Listen in order or choose a recording.'}</p>}{(audioTracks(detail.title).length > 1 || !!detail.title.chapters?.length) && <details><summary>Chapters & recordings</summary><div className="listen-track-list">{audioTracks(detail.title).length > 1 && audioTracks(detail.title).map(track => <button key={track.id} disabled={busy || !detail.canPlay} onClick={() => void play(false, track.startSeconds)}><span dir="auto">{track.title}</span><small>{audioTime(track.durationSeconds)}</small></button>)}{detail.title.chapters?.map((chapter, index) => <button key={index} disabled={busy || !detail.canPlay} onClick={() => void play(false, chapter.startSeconds)}><span dir="auto">{chapter.title}</span><small>{audioTime(chapter.startSeconds)}</small></button>)}</div></details>}{detail.canPlay ? <button className="watch-button watch-primary" disabled={busy} onClick={() => void play()}><Play size={18} />{busy ? 'Opening audio…' : 'Listen now'}</button> : detail.title.musicSubscription ? <MusicPass onChanged={() => void open(detail.title.id)} /> : detail.offer ? <WatchPlayPurchase videoId={detail.title.id} offer={detail.offer} contentKind="audio" onPurchased={() => void open(detail.title.id)} /> : <><p>Purchases for this title are not available yet. Please check again later.</p><RestoreVideoPurchases contentKind="audio" onRestored={() => void open(detail.title.id)} /></>}{error && <p role="alert">{error}</p>}</div></WatchSheet>}
  </main></>;
}
export default function ListenCatalog({ library = false }: { library?: boolean }) {
  const installed = useInstalledApp(); const uid = useAuthStore(s => s.firebaseUser?.uid);
  if (!installed) return <><BuyerHeader /><main className="listen-page"><h1>AfroBooks Listen is in the app</h1><p>Open AfroBooks on your phone for music, podcasts and audiobooks.</p><Link href="/browse">Back to books</Link></main></>;
  return <Catalog key={uid} library={library} />;
}
