import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, browserSessionPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { isSeparateAccount } from '@/lib/auth/tabAccount';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// A separate Firebase app prevents the normal/local login from synchronizing
// into this tab. Session persistence survives reloads without affecting others.
const separate = isSeparateAccount();
const name = separate ? 'afrobooks-tab-account' : '[DEFAULT]';
const existing = getApps().find(app => app.name === name);
const app = existing ?? initializeApp(firebaseConfig, name);

export const auth = separate && !existing ? initializeAuth(app, {
  persistence: browserSessionPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
}) : getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
