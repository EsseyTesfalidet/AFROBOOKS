'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { ArrowDown, ArrowUp, ListMusic, Plus, X } from 'lucide-react';
import { authenticatedGet, authenticatedPost } from '@/lib/firebase/request';
import { useWatchResource } from '@/components/watch/WatchUI';
import { useAuthStore } from '@/store/authStore';
import type { CreatorPlaylist, CreatorPlaylistView, MediaCard, MediaKind, MediaRef } from '@/types/experience';
import './experience.css';

const formats: { kind: MediaKind; label: string }[] = [
  { kind: 'book', label: 'Books' }, { kind: 'video', label: 'Videos' }, { kind: 'audio', label: 'Audio' },
];
type PlaylistDraft = Pick<CreatorPlaylist, 'id' | 'title' | 'description' | 'published' | 'items'>;

function CreatorPlaylistsContent() {
  const resource = useWatchResource<{ playlists: CreatorPlaylistView[] }>('/api/experience?view=creator_editor');
  const [draft, setDraft] = useState<PlaylistDraft | null>(null);
  const [selectedCards, setSelectedCards] = useState<MediaCard[]>([]);
  const [kind, setKind] = useState<MediaKind>('book');
  const [catalog, setCatalog] = useState<MediaCard[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function browse(format: MediaKind, after?: string | null) {
    setBusy(true); setError('');
    try {
      const suffix = after ? `&after=${encodeURIComponent(after)}` : '';
      const page = await authenticatedGet<{ items: MediaCard[]; next: string | null }>(`/api/experience?view=creator_catalog&kind=${format}${suffix}`);
      setCatalog(current => after ? [...current, ...page.items] : page.items);
      setNext(page.next);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  function newPlaylist() {
    setDraft({ id: crypto.randomUUID(), title: '', description: '', published: false, items: [] });
    setSelectedCards([]);
    setKind('book'); setCatalog([]); setNext(null); setError(''); setNotice('');
    void browse('book');
  }

  function editPlaylist(value: CreatorPlaylistView) {
    setDraft({ id: value.id, title: value.title, description: value.description, published: value.published, items: value.items.map(({ kind: itemKind, id }) => ({ kind: itemKind, id })) });
    setSelectedCards(value.items);
    setKind('book'); setCatalog([]); setNext(null); setError(''); setNotice('');
    void browse('book');
  }

  async function save(published: boolean) {
    if (!draft || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await authenticatedPost('/api/experience', { action: 'creator_playlist', data: { ...draft, published } });
      setDraft(null); setNotice(published ? 'Playlist published on your creator page.' : 'Playlist saved as a draft.'); resource.retry();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function removePlaylist(value: CreatorPlaylist) {
    if (busy || !window.confirm(`Delete “${value.title}”? Your books, videos, and audio will stay published.`)) return;
    setBusy(true); setError('');
    try { await authenticatedPost('/api/experience', { action: 'delete_creator_playlist', data: { id: value.id } }); resource.retry(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  function add(item: MediaRef) {
    if (!draft || draft.items.length >= 30 || draft.items.some(value => value.kind === item.kind && value.id === item.id)) return;
    const card = catalog.find(value => value.kind === item.kind && value.id === item.id);
    if (card) setSelectedCards(current => [...current, card]);
    setDraft({ ...draft, items: [...draft.items, item] });
  }

  function move(index: number, direction: -1 | 1) {
    if (!draft) return;
    const target = index + direction;
    if (target < 0 || target >= draft.items.length) return;
    const items = [...draft.items]; [items[index], items[target]] = [items[target], items[index]];
    const cards = [...selectedCards]; [cards[index], cards[target]] = [cards[target], cards[index]]; setSelectedCards(cards);
    setDraft({ ...draft, items });
  }

  const chosen = draft?.items.map((ref, index) => selectedCards[index] || catalog.find(item => item.kind === ref.kind && item.id === ref.id));
  const visible = catalog.filter(item => `${item.title} ${item.creator} ${item.language}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return <main className="app-page mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
    <header className="experience-panel">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--app-accent,#e9bd73)]">Author studio</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Playlists &amp; series</h1>
      <p className="mt-2">Group your published books, films, music, podcasts, and audiobooks into collections audiences can browse. Each title keeps its own price and access.</p>
      <div className="experience-actions"><button className="experience-primary" disabled={!!draft} onClick={newPlaylist}><Plus size={16} /> Create playlist</button><button disabled={resource.loading} onClick={resource.retry}>Refresh</button></div>
    </header>

    {notice && <p className="experience-panel" role="status">{notice}</p>}
    {(resource.error || error) && <p className="experience-panel" role="alert">{error || resource.error}</p>}
    {resource.loading && <p role="status">Loading your playlists…</p>}
    {resource.data && !resource.data.playlists.length && !draft && <section className="experience-panel"><ListMusic size={28} /><h2 className="mt-2">Give your releases a home</h2><p>Create a reading list, an audio album or podcast series, a documentary collection, or a cross-format theme.</p></section>}
    {resource.data?.playlists.map(value => <article className="experience-panel" key={value.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2>{value.title}</h2><p>{value.published ? 'Published' : 'Draft'} · {value.items.length} titles</p>{value.description && <p className="mt-2">{value.description}</p>}</div><div className="experience-actions"><button disabled={!!draft || busy} onClick={() => editPlaylist(value)}>Edit</button><button disabled={busy} onClick={() => void removePlaylist(value)}>Delete</button></div></div>
      <div className="experience-shelf">{value.items.map(item => <div className="experience-card" key={`${item.kind}:${item.id}`}>{item.cover && <img src={item.cover} alt="" loading="lazy" />}<small>{({ book: 'Read', video: 'Watch', audio: 'Listen' })[item.kind]}</small><strong dir="auto">{item.title}</strong><small dir="auto">{item.creator}</small></div>)}</div>
    </article>)}

    {draft && <section className="experience-panel">
      <h2>{draft.title || 'New playlist'}</h2>
      <label>Playlist title<input maxLength={120} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Description<textarea maxLength={1200} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <h3>Arrange titles · {draft.items.length}/30</h3>
      {draft.items.map((item, index) => <div className="experience-row" key={`${item.kind}:${item.id}`}><div><strong>{chosen?.[index]?.title || 'Published title'}</strong><small>{chosen?.[index]?.creator || item.kind}</small></div><button aria-label={`Move title ${index + 1} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button aria-label={`Move title ${index + 1} down`} disabled={busy || index === draft.items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button aria-label={`Remove title ${index + 1}`} disabled={busy} onClick={() => { setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) }); setSelectedCards(cards => cards.filter((_, i) => i !== index)); }}><X size={16} /></button></div>)}
      <h3 className="mt-5">Add your published work</h3>
      <div className="experience-actions" role="group" aria-label="Choose content format">{formats.map(format => <button key={format.kind} aria-pressed={kind === format.kind} disabled={busy} onClick={() => { setKind(format.kind); setCatalog([]); setSearch(''); setNext(null); void browse(format.kind); }}>{format.label}</button>)}</div>
      <label>Search titles<input type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search your published titles" /></label>
      {visible.map(item => <div className="experience-row" key={`${item.kind}:${item.id}`}><div><strong dir="auto">{item.title}</strong><small dir="auto">{item.creator} · {item.language}</small></div><button disabled={busy || draft.items.length >= 30 || draft.items.some(value => value.kind === item.kind && value.id === item.id)} onClick={() => add(item)}>Add</button></div>)}
      {!visible.length && !busy && <p>No published titles found in this format.</p>}
      {next && <div className="experience-actions"><button disabled={busy} onClick={() => void browse(kind, next)}>Load more</button></div>}
      <div className="experience-actions"><button disabled={busy || !draft.title.trim()} onClick={() => void save(false)}>{draft.published ? 'Save draft / Unpublish' : 'Save draft'}</button><button className="experience-primary" disabled={busy || !draft.title.trim() || !draft.items.length} onClick={() => void save(true)}>{draft.published ? 'Update published playlist' : 'Publish playlist'}</button><button disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Cancel</button></div>
      <p>Publishing a playlist does not change who can read, watch, or listen to a title. Audiences still buy or subscribe to each item separately.</p>
    </section>}
  </main>;
}

export default function CreatorPlaylistsStudio() {
  const uid = useAuthStore(state => state.firebaseUser?.uid);
  return <CreatorPlaylistsContent key={uid || 'guest'} />;
}
