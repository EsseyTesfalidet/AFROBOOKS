'use client';

import { useEffect, useState } from 'react';
import { hasPreviewChapters } from '@/lib/firebase/firestore';
import type { Book } from '@/types/book';

export type PreviewStatus = 'checking' | 'available' | 'unavailable' | 'error' | 'unsupported';

export function useBookPreview(book: Book | null) {
  const id = book?.id;
  const supported = !!book && book.status === 'live' && book.contentFormat !== 'pdf';
  const updated = book?.updatedAt?.toMillis?.() ?? 0;
  const key = JSON.stringify([id, supported, updated]);
  const [result, setResult] = useState<{ key: string; status: PreviewStatus } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id || !supported) return;
    let active = true;
    hasPreviewChapters(id).then(available => {
      if (active) setResult({ key, status: available ? 'available' : 'unavailable' });
    }).catch(() => { if (active) setResult({ key, status: 'error' }); });
    return () => { active = false; };
  }, [id, supported, key, attempt]);
  const status: PreviewStatus = !supported ? 'unsupported' : result?.key === key ? result.status : 'checking';
  return { status, retry: () => { setResult(null); setAttempt(value => value + 1); } };
}
