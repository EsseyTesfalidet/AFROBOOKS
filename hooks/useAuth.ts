'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { getUserProfile, updateUserProfile } from '@/lib/firebase/auth';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types/user';

export function useAuth() {
  const { firebaseUser, userProfile, loading, setFirebaseUser, setUserProfile, setLoading, reset } =
    useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const profile = await getUserProfile(fbUser.uid);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function switchRole(newRole: 'buyer' | 'seller') {
    if (!firebaseUser) return;
    await updateUserProfile(firebaseUser.uid, { activeRole: newRole });
    setUserProfile(userProfile ? { ...userProfile, activeRole: newRole } : null);
  }

  async function updateProfile(data: Partial<User>) {
    if (!firebaseUser) return;
    await updateUserProfile(firebaseUser.uid, data);
    setUserProfile(userProfile ? { ...userProfile, ...data } : null);
  }

  return {
    user: firebaseUser,
    userProfile,
    loading,
    switchRole,
    updateProfile,
    isAdmin: userProfile?.role === 'admin',
    isSeller: userProfile?.role === 'seller' || userProfile?.role === 'both',
    isBuyer: userProfile?.role === 'buyer' || userProfile?.role === 'both',
    hasSubscription: userProfile?.subscriptionStatus === 'active',
  };
}
