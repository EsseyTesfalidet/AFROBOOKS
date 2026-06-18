type FirebaseAdminModule = typeof import('../../functions/node_modules/firebase-admin');

let adminModulePromise: Promise<FirebaseAdminModule> | null = null;

function getServiceAccount() {
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return { projectId, clientEmail, privateKey };
}

async function getAdminModule() {
  if (!adminModulePromise) {
    adminModulePromise = import('../../functions/node_modules/firebase-admin');
  }

  const admin = await adminModulePromise;

  if (!admin.apps.length) {
    const serviceAccount = getServiceAccount();
    const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.projectId,
        storageBucket,
      });
    } else {
      admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket,
      });
    }
  }

  return admin;
}

export async function getAdminAuth() {
  const admin = await getAdminModule();
  return admin.auth();
}

export async function getAdminDb() {
  const admin = await getAdminModule();
  return admin.firestore();
}

export async function getAdminFieldValue() {
  const admin = await getAdminModule();
  return admin.firestore.FieldValue;
}

export async function getAdminTimestamp() {
  const admin = await getAdminModule();
  return admin.firestore.Timestamp;
}
