import { randomUUID } from 'node:crypto';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { refreshWatchAssets } from './watch';
import { WatchError } from './watchErrors';

// The existing authenticated scheduled job also advances submissions after a
// creator closes the browser. A cursor prevents a stuck upload starving others.
export async function processWatchSubmissions(db: Firestore, now = Date.now()) {
  const ref = db.doc('watchSystem/processing'); const owner = randomUUID();
  const cursor = await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    if ((old?.leaseUntil || 0) > now) return null;
    tx.set(ref, { leaseOwner: owner, leaseUntil: now + 10 * 60_000 }, { merge: true });
    return typeof old?.cursor === 'string' ? old.cursor : '';
  });
  if (cursor === null) return { busy: true, checked: 0, failed: 0 };
  let checked = 0; let failed = 0;
  try {
    let query = db.collection('watchVideos').where('status', '==', 'processing').orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(cursor);
    const rows = await query.limit(3).get();
    await Promise.all(rows.docs.map(async row => {
      const video = row.data();
      try {
        const user = (await db.doc(`users/${video.creatorId}`).get()).data();
        if (!user || !['seller', 'both', 'admin'].includes(user.role) || ['banned', 'suspended'].includes(user.status)) return;
        await refreshWatchAssets({ uid: video.creatorId, email: null, role: user.role, status: user.status || 'active' }, row.id);
        checked++;
      } catch (error) {
        failed++;
        // Never store provider responses, signed links or secrets.
        const message = error instanceof WatchError && error.status === 409 ? error.message : 'Preparing is taking longer than expected. We will retry automatically.';
        await db.doc(`watchPrivate/${row.id}`).set({ processingError: message }, { merge: true });
      }
    }));
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.leaseOwner !== owner) return;
      tx.set(ref, { cursor: rows.size === 3 ? rows.docs[2].id : '', checked, failed, lastRunAt: now, leaseUntil: 0, leaseOwner: null }, { merge: true });
    });
    return { busy: false, checked, failed };
  } catch (error) {
    await db.runTransaction(async tx => { if ((await tx.get(ref)).data()?.leaseOwner === owner) tx.update(ref, { leaseUntil: 0, leaseOwner: null }); });
    throw error;
  }
}
