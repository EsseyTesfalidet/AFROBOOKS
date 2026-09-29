import { createHash } from 'node:crypto';
import { FieldPath, type DocumentData, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { COMMUNITY_PAGE_SIZE, communityAction, communityId, type CommunityAction } from '../community';
import type { CommunityFeed, CommunityKind, CommunityPost, CommunityReply, CommunityThread } from '../../types/community';

export class CommunityError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const key = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 40);
const id = (value: string) => communityId.parse(value);
const postRef = (db: Firestore, value: string) => db.collection('communityPosts').doc(id(value));
const publicName = (person: DocumentData) => String(person.username || person.firstName || 'Member').slice(0, 80);

function serializePost(doc: DocumentSnapshot): CommunityPost {
  const data = doc.data()!;
  return { id: doc.id, kind: data.kind, title: data.title, body: data.body, authorId: data.authorId,
    authorName: data.authorName, country: data.country, language: data.language, status: data.status,
    createdAt: data.createdAt, replyCount: data.replyCount, acceptedReplyId: data.acceptedReplyId ?? null };
}

function serializeReply(doc: DocumentSnapshot, admin = false): CommunityReply {
  const data = doc.data()!;
  const visible = data.status === 'active' || (admin && data.status !== 'removed');
  return { id: doc.id, body: visible ? data.body : '', authorId: visible ? data.authorId : '',
    authorName: visible ? data.authorName : 'Member', country: visible ? data.country : '',
    language: visible ? data.language : '', status: data.status, createdAt: data.createdAt,
    parentReplyId: data.parentReplyId ?? null, parentAuthorName: visible ? data.parentAuthorName ?? null : null };
}

function activePerson(doc: DocumentSnapshot, admin = false) {
  const person = doc.data();
  if (!person || !['active', 'warned'].includes(person.status)) throw new CommunityError('This account cannot participate.', 403);
  if (admin && person.role !== 'admin') throw new CommunityError('Administrator access required.', 403);
  return person;
}

function budget(tx: Transaction, doc: DocumentSnapshot, now: number, maximum: number, delay: number) {
  const ref = doc.ref;
  const previous = doc.data();
  const day = Math.floor(now / 86400000);
  const count = previous?.day === day ? previous.count : 0;
  if (count >= maximum || (previous && now - previous.lastAt < delay)) {
    throw new CommunityError(count >= maximum ? 'You have reached today’s limit. Please try again tomorrow.' : 'Please wait a little before posting again.', 429);
  }
  return () => tx.set(ref, { day, count: count + 1, lastAt: now });
}

function available(doc: DocumentSnapshot) {
  if (!doc.exists || doc.data()?.status !== 'active') throw new CommunityError('This conversation is no longer available.', 404);
}

function notify(db: Firestore, tx: Transaction, event: string, uid: string, postId: string, message: string, now: number) {
  tx.set(db.collection('notifications').doc(`community_${key(`${event}:${uid}`)}`), {
    userId: uid, type: 'system', title: 'Community reply', message, isRead: false,
    actionUrl: `/community/${postId}`, createdAt: new Date(now),
  });
}

export async function mutateCommunity(db: Firestore, uid: string, input: unknown, now = Date.now()) {
  const parsed = communityAction.safeParse(input);
  if (!parsed.success) throw new CommunityError('Check the form fields and try again.');
  const action: CommunityAction = parsed.data;
  const personRef = db.collection('users').doc(uid);
  const limitRef = (bucket: string) => db.collection('communityLimits').doc(key(`${uid}:${bucket}`));
  const references: DocumentReference[] = [personRef];
  if (action.action === 'create') {
    references.push(db.collection('communityPosts').doc(key(`${uid}:post:${action.attemptId}`)), limitRef('posts'));
  } else if (action.action === 'dismissReport') {
    references.push(db.collection('communityReports').doc(action.reportId));
  } else {
    const ref = postRef(db, action.postId);
    references.push(ref);
    if ('replyId' in action && action.replyId) references.push(ref.collection('replies').doc(action.replyId));
    if (action.action === 'reply') {
      references.push(ref.collection('replies').doc(key(`${uid}:${ref.id}:${action.attemptId}`)), limitRef('replies'));
      if (action.parentReplyId) references.push(ref.collection('replies').doc(action.parentReplyId));
    }
    if (action.action === 'report') references.push(db.collection('communityReports').doc(key(`${uid}:${ref.id}:${action.replyId ?? ''}`)), limitRef('reports'));
  }
  return db.runTransaction(async tx => {
    // Read each dependency in one batch, in a stable order. This reduces lock
    // contention on simultaneous retries and keeps all reads ahead of writes.
    const snapshots = await tx.getAll(...references.sort((a, b) => a.path.localeCompare(b.path)));
    const read = (ref: DocumentReference) => snapshots.find(snapshot => snapshot.ref.path === ref.path)!;
    const adminAction = ['feature', 'moderate', 'dismissReport'].includes(action.action) || (action.action === 'create' && action.kind === 'weekly');
    const person = activePerson(read(personRef), adminAction);

    if (action.action === 'create') {
      if (action.kind === 'memory' && action.body.length < 20) throw new CommunityError('Add at least 20 characters describing what you remember.');
      const ref = db.collection('communityPosts').doc(key(`${uid}:post:${action.attemptId}`));
      const previous = read(ref);
      if (previous.exists) return { id: ref.id };
      const spend = budget(tx, read(limitRef('posts')), now, person.role === 'admin' ? 30 : 5, 30000);
      tx.create(ref, { kind: action.kind, title: action.title, body: action.body, country: action.country,
        language: action.language, authorId: uid, authorName: action.kind === 'weekly' ? 'AfroBooks' : publicName(person),
        createdAt: now, updatedAt: now, status: 'active', replyCount: 0, acceptedReplyId: null });
      if (action.kind === 'weekly') tx.set(db.doc('communitySettings/weekly'), { postId: ref.id, updatedAt: now, updatedBy: uid });
      spend();
      return { id: ref.id };
    }

    if (action.action === 'dismissReport') {
      const ref = db.collection('communityReports').doc(action.reportId);
      if (!read(ref).exists) throw new CommunityError('Report not found.', 404);
      tx.update(ref, { status: 'resolved', resolvedBy: uid, resolvedAt: now });
      return { ok: true };
    }

    const ref = postRef(db, action.postId);
    const post = read(ref);
    if (!post.exists) throw new CommunityError('Conversation not found.', 404);
    const data = post.data()!;

    if (action.action === 'reply') {
      available(post);
      const reply = ref.collection('replies').doc(key(`${uid}:${ref.id}:${action.attemptId}`));
      if (read(reply).exists) return { id: reply.id };
      const parent = action.parentReplyId ? read(ref.collection('replies').doc(action.parentReplyId)) : null;
      if (parent) available(parent);
      const spend = budget(tx, read(limitRef('replies')), now, 60, 10000);
      tx.create(reply, { body: action.body, country: action.country, language: action.language,
        authorId: uid, authorName: publicName(person), status: 'active', createdAt: now,
        parentReplyId: action.parentReplyId, parentAuthorName: parent?.data()?.authorName ?? null });
      tx.update(ref, { replyCount: data.replyCount + 1, updatedAt: now });
      const recipients = new Set<string>([data.authorId, parent?.data()?.authorId].filter(Boolean));
      recipients.delete(uid);
      for (const recipient of recipients) notify(db, tx, reply.id, recipient, ref.id, `${publicName(person)} replied to “${data.title}”.`, now);
      spend();
      return { id: reply.id };
    }

    if (action.action === 'accept') {
      available(post);
      if (data.kind !== 'memory' || data.authorId !== uid) throw new CommunityError('Only the person who asked can mark a memory as found.', 403);
      const reply = action.replyId ? read(ref.collection('replies').doc(action.replyId)) : null;
      if (reply) { available(reply); if (reply.data()?.authorId === uid) throw new CommunityError('Choose a reply from another member.'); }
      if (data.acceptedReplyId === action.replyId) return { ok: true };
      tx.update(ref, { acceptedReplyId: action.replyId, updatedAt: now });
      if (reply) notify(db, tx, `found:${ref.id}:${reply.id}`, reply.data()!.authorId, ref.id, `Your reply helped someone find a memory: “${data.title}”.`, now);
      return { ok: true };
    }

    if (action.action === 'feature') {
      available(post);
      if (data.kind !== 'weekly') throw new CommunityError('Choose a weekly question.');
      tx.set(db.doc('communitySettings/weekly'), { postId: ref.id, updatedAt: now, updatedBy: uid });
      return { ok: true };
    }

    const target = action.replyId ? read(ref.collection('replies').doc(action.replyId)) : post;
    if (!target.exists) throw new CommunityError('Content not found.', 404);
    const targetData = target.data()!;
    if (action.action === 'report') {
      available(post); available(target);
      const report = db.collection('communityReports').doc(key(`${uid}:${ref.id}:${action.replyId ?? ''}`));
      if (read(report).exists) return { ok: true };
      const spend = budget(tx, read(limitRef('reports')), now, 10, 5000);
      tx.create(report, { postId: ref.id, replyId: action.replyId, reporterId: uid, reason: action.reason, createdAt: now, status: 'open' });
      spend();
      return { ok: true };
    }

    if (action.action === 'remove' && targetData.authorId !== uid) throw new CommunityError('You can only remove your own contribution.', 403);
    if (targetData.status === 'removed') throw new CommunityError('This contribution has been removed.', 404);
    const status = action.action === 'remove' ? 'removed' : action.hidden ? 'hidden' : 'active';
    if (targetData.status === status) return { ok: true };
    tx.update(target.ref, { status, updatedAt: now, moderatedBy: uid,
      ...(status === 'removed' ? { body: '', ...(action.replyId ? {} : { title: 'Removed memory request' }) } : {}) });
    if (action.replyId) {
      tx.update(ref, { replyCount: Math.max(0, data.replyCount + (status === 'active' ? 1 : targetData.status === 'active' ? -1 : 0)),
        ...(data.acceptedReplyId === action.replyId && status !== 'active' ? { acceptedReplyId: null } : {}), updatedAt: now });
    }
    return { ok: true };
  });
}

export async function communityFeed(db: Firestore, kind: CommunityKind, cursor: string | null, admin = false): Promise<CommunityFeed> {
  let query = admin ? db.collection('communityPosts').orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc')
    : db.collection('communityPosts').where('kind', '==', kind).where('status', '==', 'active').orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (cursor) {
    const previous = await postRef(db, cursor).get();
    if (!previous.exists || (!admin && (previous.data()?.kind !== kind || previous.data()?.status !== 'active'))) throw new CommunityError('This list changed. Please refresh it.');
    query = query.startAfter(previous);
  }
  const [posts, settings] = await Promise.all([query.limit(COMMUNITY_PAGE_SIZE + 1).get(), db.doc('communitySettings/weekly').get()]);
  const featuredId = settings.data()?.postId;
  const featuredDoc = featuredId ? await postRef(db, featuredId).get() : null;
  const featured = featuredDoc?.exists && featuredDoc.data()?.status === 'active' && featuredDoc.data()?.kind === 'weekly' ? serializePost(featuredDoc) : null;
  return { posts: posts.docs.slice(0, COMMUNITY_PAGE_SIZE).map(serializePost), featured,
    nextCursor: posts.size > COMMUNITY_PAGE_SIZE ? posts.docs[COMMUNITY_PAGE_SIZE - 1].id : null };
}

export async function communityThread(db: Firestore, postId: string, cursor: string | null, admin = false, replyId: string | null = null): Promise<CommunityThread> {
  const ref = postRef(db, postId);
  const post = await ref.get();
  if (!post.exists || post.data()?.status === 'removed' || (!admin && post.data()?.status !== 'active')) throw new CommunityError('This conversation is no longer available.', 404);
  let query = ref.collection('replies').orderBy('createdAt').orderBy(FieldPath.documentId());
  if (cursor) {
    const previous = await ref.collection('replies').doc(id(cursor)).get();
    if (!previous.exists) throw new CommunityError('Please refresh the replies.');
    query = query.startAfter(previous);
  }
  const [replies, accepted, focused] = await Promise.all([query.limit(COMMUNITY_PAGE_SIZE + 1).get(), post.data()?.acceptedReplyId ? ref.collection('replies').doc(id(post.data()!.acceptedReplyId)).get() : null,
    admin && replyId ? ref.collection('replies').doc(id(replyId)).get() : null]);
  return { post: serializePost(post), replies: replies.docs.slice(0, COMMUNITY_PAGE_SIZE).map(doc => serializeReply(doc, admin)),
    acceptedReply: accepted?.exists && accepted.data()?.status === 'active' ? serializeReply(accepted) : null,
    focusedReply: focused?.exists ? serializeReply(focused, admin) : null,
    nextCursor: replies.size > COMMUNITY_PAGE_SIZE ? replies.docs[COMMUNITY_PAGE_SIZE - 1].id : null };
}
