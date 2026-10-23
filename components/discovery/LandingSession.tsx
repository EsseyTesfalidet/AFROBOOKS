'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

// Public content is present in the server response even while Firebase starts.
// Installed-app access is still enforced by the root MobileAccessGate.
export default function LandingSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { userProfile, loading } = useAuthStore();
  useEffect(() => {
    if (loading || !userProfile) return;
    router.replace(userProfile.role === 'admin' ? '/admin' : userProfile.activeRole === 'seller' ? '/dashboard' : '/browse');
  }, [loading, userProfile, router]);
  if (!loading && userProfile) return <p role="status" className="p-8 text-center">Opening your account…</p>;
  return <>{children}</>;
}
