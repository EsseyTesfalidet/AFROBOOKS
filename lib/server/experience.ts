import { randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import type { AuthenticatedRequestUser as Actor } from './auth';
import { WatchError } from './watchErrors';
import type { ExperiencePreferences, Playlist, MediaRef, MediaCard, StoryCollection, CreatorPlaylist, CreatorPlaylistView } from '@/types/experience';
import { canReadWithSubscription, isBookReleased } from '@/lib/utils/bookAccess';
import type { Book } from '@/types/book';
import type { User } from '@/types/user';
import { musicStatus } from './musicSubscriptions';

const id = z.string().regex(/^[\w-]{1,128}$/);
const reference = z.object({ kind: z.enum(['book', 'video', 'audio']), id });
const refs = z.array(reference).max(30).refine(items => new Set(items.map(item => `${item.kind}:${item.id}`)).size === items.length, 'Remove duplicate titles.');
const playlist = z.object({ id, name: z.string().trim().min(1).max(80), titleIds: z.array(id).max(100).refine(items => new Set(items).size === items.length, 'Remove duplicate titles.') });
const collection = z.object({ id, title: z.string().trim().min(1).max(120), description: z.string().trim().max(1200), published: z.boolean(), items: refs }).refine(value => !value.published || (value.items.length >= 2 && new Set(value.items.map(item => item.kind)).size >= 2), 'Published collections need at least two titles in different formats.');
const creatorPlaylist = z.object({ id, title: z.string().trim().min(1).max(120), description: z.string().trim().max(1200), published: z.boolean(), items: refs });
const paths = { book: 'books', video: 'watchVideos', audio: 'audioTitles' };
const millis = (value: unknown): number => typeof value === 'number' ? value : value && typeof (value as { toMillis?: unknown }).toMillis === 'function' ? (value as { toMillis: () => number }).toMillis() : 0;
export async function mediaCards(items: MediaRef[]): Promise<MediaCard[]> {
  if (!items.length) return [];
  const db = await getAdminDb();
  const rows = await db.getAll(...items.map(item => db.doc(`${paths[item.kind]}/${id.parse(item.id)}`)));
  return rows.flatMap((row, index) => {
    const value = row.data(); const item = items[index];
    if (!value || value.status !== (item.kind === 'book' ? 'live' : 'published')) return [];
    if (item.kind === 'book' && value.deletionPending === true) return [];
    if (item.kind === 'audio' && value.ready !== true) return [];
    // Explicit public metadata only: collections and playlists never grant access.
    return [{ ...item, title: String(value.title || ''), creator: String(value.authorName || value.creatorName || ''), language: String(value.language || ''), cover: String(value.coverUrl || value.posterUrl || ''), href: item.kind === 'book' ? `/book/${item.id}` : item.kind === 'video' ? `/watch/${item.id}` : `/listen?title=${item.id}` }];
  });
}
export async function experiencePreferences(actor: Actor): Promise<ExperiencePreferences> {
  const row = await (await getAdminDb()).doc(`experiencePreferences/${actor.uid}`).get();
  return { languages: row.data()?.languages || [], playlists: row.data()?.playlists || [] };
}
export async function experienceWrite(actor: Actor, input: unknown) {
  const { action, data } = z.object({ action: z.enum(['languages', 'playlist', 'delete_playlist', 'collection', 'delete_collection', 'creator_playlist', 'delete_creator_playlist']), data: z.record(z.unknown()) }).parse(input);
  const db = await getAdminDb();
  if (action === 'creator_playlist' || action === 'delete_creator_playlist') {
    if (!['seller', 'both', 'admin'].includes(actor.role)) throw new WatchError(403, 'Author studio access is required.');
    const key = id.parse(data.id);
    const ref = db.doc(`creatorPlaylists/${key}`);
    const value = action === 'creator_playlist' ? creatorPlaylist.parse(data) : null;
    if (value?.published && value.items.length === 0) throw new WatchError(400, 'Add at least one published title before publishing this playlist.');
    await db.runTransaction(async tx => {
      const old = await tx.get(ref);
      if (old.exists && old.data()?.creatorId !== actor.uid) throw new WatchError(403, 'This playlist belongs to another creator.');
      const titleRefs = value?.items.map(item => db.doc(`${paths[item.kind]}/${item.id}`)) || [];
      const titles = titleRefs.length ? await tx.getAll(...titleRefs) : [];
      for (let index = 0; index < (value?.items.length || 0); index++) {
        const item = value!.items[index]; const title = titles[index].data();
        if (!title) throw new WatchError(400, 'One of these titles is no longer available. Remove it and try again.');
        const ownerId = item.kind === 'book' ? title.sellerId : title.creatorId;
        if (ownerId !== actor.uid) throw new WatchError(403, 'Playlists can include only your own titles.');
        const isPublished = title.status === (item.kind === 'book' ? 'live' : 'published') && title.deletionPending !== true && (item.kind !== 'audio' || title.ready === true);
        if (!isPublished) throw new WatchError(400, 'Playlists can include only published titles that are ready for audiences.');
      }
      if ((!old.exists && value) || (old.exists && !value)) {
        const quotaRef = db.doc(`creatorPlaylistQuotas/${actor.uid}`);
        const quota = await tx.get(quotaRef);
        const count = quota.exists ? Number(quota.data()?.count || 0) : (await tx.get(db.collection('creatorPlaylists').where('creatorId', '==', actor.uid).limit(20))).size;
        if (value && count >= 20) throw new WatchError(400, 'You can create up to 20 public playlists.');
        tx.set(quotaRef, { count: Math.max(0, count + (value ? 1 : -1)) });
      }
      if (value) tx.set(ref, { ...value, creatorId: actor.uid, updatedAt: Date.now() });
      else if (old.exists) tx.delete(ref);
    });
    return { ok: true };
  }
  if (action === 'collection' || action === 'delete_collection') {
    if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.');
    const key = id.parse(data.id);
    if (action === 'delete_collection') { await db.doc(`storyCollections/${key}`).delete(); return { ok: true }; }
    const value = collection.parse(data);
    if (value.published && (await mediaCards(value.items)).length !== value.items.length) throw new WatchError(400, 'Only published titles can appear in a published collection.');
    await db.doc(`storyCollections/${key}`).set({ ...value, updatedAt: Date.now(), editedBy: actor.uid });
    return { ok: true };
  }
  const ref = db.doc(`experiencePreferences/${actor.uid}`);
  if (action === 'languages') {
    const languages = z.array(z.string().trim().min(1).max(40)).max(15).parse(data.languages);
    await ref.set({ languages: [...new Set(languages)] }, { merge: true });
  } else {
    const value = action === 'playlist' ? playlist.parse({ ...data, id: data.id || randomUUID() }) : null;
    const key = value?.id || id.parse(data.id);
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data(); const lists = (current?.playlists || []) as Playlist[];
      if (value && !lists.some(item => item.id === key) && lists.length >= 20) throw new WatchError(400, 'You can keep up to 20 playlists.');
      const next = value ? lists.some(item => item.id === key) ? lists.map(item => item.id === key ? value : item) : [...lists, value] : lists.filter(item => item.id !== key);
      tx.set(ref, { playlists: next }, { merge: true });
    });
  }
  return experiencePreferences(actor);
}
async function creatorPlaylistViews(key: string, includeDrafts: boolean): Promise<CreatorPlaylistView[]> {
  const db = await getAdminDb();
  const rows = await db.collection('creatorPlaylists').where('creatorId', '==', key).limit(40).get();
  const playlists = rows.docs.map(row => ({ ...row.data(), id: row.id }) as CreatorPlaylist)
    .filter(value => includeDrafts || value.published === true)
    .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
  const refsByKey = new Map<string, MediaRef>();
  for (const value of playlists) for (const item of value.items || []) refsByKey.set(`${item.kind}:${item.id}`, item);
  const cards = await mediaCards([...refsByKey.values()]);
  const cardsByKey = new Map(cards.map(item => [`${item.kind}:${item.id}`, item]));
  const views = playlists.map(value => ({ ...value, items: (value.items || []).flatMap(item => { const card = cardsByKey.get(`${item.kind}:${item.id}`); return card ? [card] : []; }) }));
  return includeDrafts ? views : views.filter(value => value.items.length > 0);
}
export async function publicCreatorPlaylists(creatorId: string): Promise<CreatorPlaylistView[]> {
  const key = id.parse(creatorId); const db = await getAdminDb();
  const user = (await db.doc(`users/${key}`).get()).data();
  if (!user || !['seller', 'both', 'admin'].includes(user.role) || ['suspended', 'banned'].includes(user.status)) return [];
  return creatorPlaylistViews(key, false);
}
export async function experienceCreatorPlaylists(actor: Actor, creatorId: string, editor = false) {
  const key = id.parse(creatorId);
  if (editor && (actor.uid !== key || !['seller', 'both', 'admin'].includes(actor.role))) throw new WatchError(403, 'You can manage only your own playlists.');
  return { playlists: editor ? await creatorPlaylistViews(key, true) : await publicCreatorPlaylists(key) };
}
export async function experienceCreatorCatalog(actor: Actor, kind: MediaRef['kind'], after: string | null) {
  if (!['seller', 'both', 'admin'].includes(actor.role)) throw new WatchError(403, 'Author studio access is required.');
  const db = await getAdminDb(); const owner = kind === 'book' ? 'sellerId' : 'creatorId';
  let query = db.collection(paths[kind]).where(owner, '==', actor.uid).orderBy(FieldPath.documentId());
  if (after) query = query.startAfter(id.parse(after));
  const rows = await query.limit(41).get(); const page = rows.docs.slice(0, 40);
  const items = page.map(row => ({ kind, id: row.id } as MediaRef));
  return { items: await mediaCards(items), next: rows.size > 40 ? page[39].id : null };
}
export async function experienceCollections(actor: Actor, admin = false) {
  if (admin && actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.');
  const db = await getAdminDb();
  const rows = await (admin ? db.collection('storyCollections') : db.collection('storyCollections').where('published', '==', true)).limit(40).get();
  const values = rows.docs.map(row => ({ id: row.id, title: row.data().title, description: row.data().description, published: row.data().published, items: row.data().items, updatedAt: row.data().updatedAt }) as StoryCollection).sort((a,b) => b.updatedAt-a.updatedAt);
  if (admin) return { collections: values };
  return { collections: await Promise.all(values.map(async value => ({ ...value, items: await mediaCards(value.items) }))) };
}
export async function experienceContinue(actor: Actor) {
  const db = await getAdminDb();
  const [books, videos, audio] = await Promise.all([
    db.collection('readingProgress').where('userId', '==', actor.uid).where('isFinished', '==', false).orderBy('lastReadAt', 'desc').limit(20).get(),
    db.collection(`watchStates/${actor.uid}/videos`).orderBy('updatedAt', 'desc').limit(20).get(),
    db.collection(`audioStates/${actor.uid}/titles`).orderBy('updatedAt', 'desc').limit(20).get(),
  ]);
  const states = [...books.docs.map(row => ({ kind: 'book' as const, id: row.data().bookId as string, value: row.data() })), ...videos.docs.map(row => ({ kind: 'video' as const, id: row.id, value: row.data() })), ...audio.docs.map(row => ({ kind: 'audio' as const, id: row.id, value: row.data() }))].filter(item => id.safeParse(item.id).success);
  const cards = await mediaCards(states);
  const records = states.length ? await db.getAll(...states.map(item => db.doc(`${paths[item.kind]}/${item.id}`))) : [];
  const grants = states.length ? await db.getAll(...states.map(item => db.doc(item.kind === 'book' ? `library/${actor.uid}_${item.id}` : item.kind === 'video' ? `watchEntitlements/${actor.uid}/videos/${item.id}` : `audioEntitlements/${actor.uid}/titles/${item.id}`))) : [];
  const recordsByKey = new Map(states.map((item, index) => [`${item.kind}:${item.id}`, records[index]]));
  const grantsByKey = new Map(states.map((item, index) => [`${item.kind}:${item.id}`, grants[index]]));
  const cardsByKey = new Map(cards.map(card => [`${card.kind}:${card.id}`, card]));
  const profile = (await db.doc(`users/${actor.uid}`).get()).data() as User | undefined;
  const music = records.some(row => row.data()?.musicSubscription) ? await musicStatus(actor).catch(() => null) : null;
  const result = states.flatMap(item => {
    const key = `${item.kind}:${item.id}`; const card = cardsByKey.get(key); const record = recordsByKey.get(key); const grant = grantsByKey.get(key);
    if (!card || !record || !grant) return [];
    const state = item.value; const value = record.data()!;
    const creator = value.sellerId === actor.uid || value.creatorId === actor.uid || actor.role === 'admin';
    const accessible = card.kind === 'book'
      ? !value.deletionPending && (creator || (isBookReleased(value as Book) && (grant.exists || canReadWithSubscription(value as Book, profile || null))))
      : creator || (value.musicSubscription ? music?.active === true : !value.priceCents || grant.data()?.status === 'active');
    if (!accessible) return [];
    const progress = card.kind === 'book' ? state.percentComplete : 100 * (state.seconds || 0) / (value.durationSeconds || Infinity);
    if (!(progress > 0 && progress < 98)) return [];
    return [{ ...card, href: card.kind === 'book' ? `/read/${card.id}` : card.kind === 'audio' ? `/listen?title=${card.id}&resume=1` : card.href, progress: Math.round(progress), updatedAt: millis(card.kind === 'book' ? state.lastReadAt : state.updatedAt) }];
  });
  return { items: result.sort((a,b) => b.updatedAt-a.updatedAt).slice(0,20) };
}
export async function playlistTitles(actor: Actor) {
  const prefs = await experiencePreferences(actor);
  const ids = [...new Set(prefs.playlists.flatMap(item => item.titleIds))];
  return { items: await mediaCards(ids.slice(0, 2000).map(id => ({ kind: 'audio', id }))) };
}
