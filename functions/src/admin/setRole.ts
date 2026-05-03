import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const setAdminRole = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { uid, role, secret } = req.body;

  if (secret !== process.env.ADMIN_BOOTSTRAP_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!uid || !role) {
    res.status(400).json({ error: 'uid and role are required' });
    return;
  }

  const db = admin.firestore();
  await db.collection('users').doc(uid).update({ role });
  await admin.auth().setCustomUserClaims(uid, { role });

  res.json({ ok: true });
});
