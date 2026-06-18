import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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

function ensureAdminApp() {
  if (getApps().length) {
    return getApps()[0];
  }

  const serviceAccount = getServiceAccount();
  return initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });
}

const uid = process.argv[2];

if (!uid) {
  throw new Error('Usage: node --env-file=.env.local scripts/set-admin.mjs <uid>');
}

const app = ensureAdminApp();
const db = getFirestore(app);
const auth = getAuth(app);

await db.collection('users').doc(uid).update({ role: 'admin' });
await auth.setCustomUserClaims(uid, { role: 'admin' });

console.log(`Done — user ${uid} is now admin.`);
