'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getBook, isBookInLibrary } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import InAppReader from '@/components/reader/InAppReader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import type { Book } from '@/types/book';

export default function ReadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userProfile = useAuthStore((s) => s.userProfile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const authLoading = useAuthStore((s) => s.loading);

  const [book, setBook] = useState<Book | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { router.replace('/login'); return; }

    Promise.all([
      getBook(id),
      isBookInLibrary(firebaseUser.uid, id),
    ]).then(([b, owned]) => {
      if (!b) { router.replace('/browse'); return; }
      setBook(b);

      const isSubscriber = userProfile?.subscriptionStatus === 'active';
      const canSubRead = isSubscriber && b.inSubscription;
      const access = owned || canSubRead;

      if (!access && !b.inSubscription && !owned) {
        // Allow reading preview (first chapter only)
        setHasAccess(false);
      } else {
        setHasAccess(!!access);
      }

      setLoading(false);
    });
  }, [id, authLoading, firebaseUser?.uid, userProfile?.subscriptionStatus]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]"><LoadingSpinner size={36} /></div>;
  if (!book || !firebaseUser) return null;

  return (
    <InAppReader
      book={book}
      userId={firebaseUser.uid}
      hasAccess={hasAccess}
    />
  );
}
