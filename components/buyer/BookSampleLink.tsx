'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import type { PreviewStatus } from '@/hooks/useBookPreview';

export default function BookSampleLink({ bookId, status, retry, compact = false }: {
  bookId: string; status: PreviewStatus; retry: () => void; compact?: boolean;
}) {
  if (status === 'unsupported') return null;
  const className = `${compact ? 'text-xs' : 'text-sm'} text-[#aaa]`;
  if (status === 'checking') return <span className={className} role="status">Checking sample…</span>;
  if (status === 'unavailable') return <span className={className}>No free sample available</span>;
  if (status === 'error') return <button type="button" onClick={retry} className={`${className} min-h-11 underline`}>Couldn’t check sample. Try again</button>;
  return <Link href={`/sample/${bookId}`} className={`${className} inline-flex min-h-11 items-center gap-2`}><BookOpen size={14} />{compact ? 'Read sample' : 'Read free sample'}</Link>;
}
