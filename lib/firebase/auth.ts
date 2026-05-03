import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';
import type { User as UserProfile } from '@/types/user';

const googleProvider = new GoogleAuthProvider();

function generateReferralCode(firstName: string): string {
  const adj = ['AFRO', 'BOLD', 'EPIC', 'WISE', 'COOL'];
  const randomAdj = adj[Math.floor(Math.random() * adj.length)];
  const year = new Date().getFullYear();
  return `${firstName.toUpperCase().slice(0, 4)}-${randomAdj}-${year}`;
}

export async function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: 'buyer' | 'seller'
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(credential.user);

  const userDoc: Omit<UserProfile, 'createdAt' | 'updatedAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    uid: credential.user.uid,
    email,
    firstName,
    lastName,
    username: email.split('@')[0].toLowerCase(),
    avatarUrl: null,
    bio: '',
    phone: '',
    country: '',
    dateOfBirth: '',
    role: role === 'seller' ? 'seller' : 'buyer',
    activeRole: role === 'seller' ? 'seller' : 'buyer',
    status: 'active',
    stripeCustomerId: null,
    referralCode: generateReferralCode(firstName),
    referredBy: null,
    referralCredits: 0,
    subscriptionId: null,
    subscriptionPlan: 'none',
    subscriptionStatus: 'none',
    notificationPreferences: {
      purchaseConfirmations: true,
      readingReminders: true,
      newChapterAlerts: true,
      reviewReplies: true,
      flashSales: true,
      recommendations: true,
      emailReceipts: true,
      weeklyDigest: false,
      promotionalEmails: false,
    },
    readerPreferences: {
      fontSize: 'medium',
      theme: 'dark',
      lineSpacing: 'normal',
    },
    favoriteGenre: '',
    language: 'en',
    currency: 'USD',
    createdAt: serverTimestamp() as unknown as import('firebase/firestore').Timestamp,
    updatedAt: serverTimestamp() as unknown as import('firebase/firestore').Timestamp,
  };

  await setDoc(doc(db, 'users', credential.user.uid), userDoc);
  return credential.user;
}

export async function logIn(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  const userRef = doc(db, 'users', credential.user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    const nameParts = (credential.user.displayName || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    await setDoc(userRef, {
      uid: credential.user.uid,
      email: credential.user.email,
      firstName,
      lastName,
      username: (credential.user.email || '').split('@')[0].toLowerCase(),
      avatarUrl: credential.user.photoURL,
      bio: '',
      phone: '',
      country: '',
      dateOfBirth: '',
      role: 'buyer',
      activeRole: 'buyer',
      status: 'active',
      stripeCustomerId: null,
      referralCode: generateReferralCode(firstName),
      referredBy: null,
      referralCredits: 0,
      subscriptionId: null,
      subscriptionPlan: 'none',
      subscriptionStatus: 'none',
      notificationPreferences: {
        purchaseConfirmations: true,
        readingReminders: true,
        newChapterAlerts: true,
        reviewReplies: true,
        flashSales: true,
        recommendations: true,
        emailReceipts: true,
        weeklyDigest: false,
        promotionalEmails: false,
      },
      readerPreferences: {
        fontSize: 'medium',
        theme: 'dark',
        lineSpacing: 'normal',
      },
      favoriteGenre: '',
      language: 'en',
      currency: 'USD',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return credential.user;
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) return null;
  return snapshot.data() as UserProfile;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<UserProfile>
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('No authenticated user');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}
