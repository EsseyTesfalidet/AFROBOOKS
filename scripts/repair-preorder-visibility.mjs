import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function getServiceAccount() {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT is required.');
  }

  const parsed = JSON.parse(raw);
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT is missing required fields.');
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

function getAdminDb() {
  if (!getApps().length) {
    const serviceAccount = getServiceAccount();
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });
  }

  return getFirestore();
}

async function main() {
  const db = getAdminDb();
  const booksRef = db.collection('books');
  const settingsSnap = await db.collection('platformSettings').doc('global').get();
  const autoApproveBooks = settingsSnap.exists ? settingsSnap.data()?.autoApproveBooks !== false : true;
  const targetStatus = autoApproveBooks ? 'live' : 'in_review';

  const brokenPreordersSnap = await booksRef
    .where('status', '==', 'draft')
    .where('isPreorder', '==', true)
    .get();

  const batch = db.batch();
  let repairedPreorders = 0;
  let promotedReviewedBooks = 0;

  brokenPreordersSnap.docs.forEach((bookDoc) => {
    const data = bookDoc.data();
    batch.update(bookDoc.ref, {
      status: targetStatus,
      publishedAt: data.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    repairedPreorders += 1;
  });

  if (autoApproveBooks) {
    const inReviewSnap = await booksRef.where('status', '==', 'in_review').get();
    inReviewSnap.docs.forEach((bookDoc) => {
      const data = bookDoc.data();
      batch.update(bookDoc.ref, {
        status: 'live',
        publishedAt: data.publishedAt ?? data.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      promotedReviewedBooks += 1;
    });
  }

  if (repairedPreorders === 0 && promotedReviewedBooks === 0) {
    console.log('No hidden books found to repair.');
    return;
  }

  await batch.commit();
  console.log(
    `Repaired ${repairedPreorders} pre-order book(s) and promoted ${promotedReviewedBooks} in-review book(s).`
  );
}

main().catch((error) => {
  console.error('Failed to repair pre-order visibility:', error);
  process.exitCode = 1;
});
