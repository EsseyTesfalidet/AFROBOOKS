import { randomUUID } from 'node:crypto';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { syncPlayPurchase } from './watchPlay';
import { googlePlay, type PlayClient } from './watchPlayClient';

// A bounded, leased sweep retries missed notifications, acknowledgement failures
// and pending financial data. Never log purchase tokens or raw provider errors.
export async function reconcileVideoPurchases(db: Firestore, client: PlayClient = googlePlay, now = Date.now()) {
  const ref = db.doc('watchSystem/reconciliation');
  const owner = randomUUID();
  const cursor = await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if ((current?.leaseUntil || 0) > now) return null;
    tx.set(ref, { leaseOwner: owner, leaseUntil: now + 10 * 60_000 }, { merge: true });
    return typeof current?.cursor === 'string' ? current.cursor : '';
  });
  if (cursor === null) return { busy: true, checked: 0, failed: 0 };
  let checked = 0; let failed = 0;
  try {
    let query = db.collection('watchPlayPurchases').orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(cursor);
    const rows = await query.limit(5).get();
    for (const doc of rows.docs) {
      const purchase = doc.data();
      try {
        await syncPlayPurchase(db, purchase.purchaseToken, undefined, undefined, client);
        checked++;
      } catch { failed++; }
    }
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.leaseOwner !== owner) return;
      tx.set(ref, { cursor: rows.size === 5 ? rows.docs[4].id : '', checked, failed, lastRunAt: now, leaseUntil: 0, leaseOwner: null }, { merge: true });
    });
    return { busy: false, checked, failed };
  } catch (error) {
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.leaseOwner === owner) tx.update(ref, { leaseUntil: 0, leaseOwner: null });
    });
    throw error;
  }
}
