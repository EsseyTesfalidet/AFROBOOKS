'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { Book } from '@/types/book';

export default function BookCover({ book, eager = false, compact = false }: { book: Pick<Book, 'coverUrl' | 'coverBgColor' | 'coverAccentColor' | 'title' | 'authorName'>; eager?: boolean; compact?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = book.coverUrl?.trim();
  const hasImage = !!url && failedUrl !== url;
  return <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-white/10" style={{ background: book.coverBgColor || '#29251e' }}>
    {hasImage ? <img src={url} alt={`Cover of ${book.title}`} loading={eager ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 h-full w-full object-contain" onError={() => setFailedUrl(url)} />
      : <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/5 to-black/40 px-3 py-4 text-center">
        <BookOpen size={26} className="shrink-0 text-white/60" aria-hidden="true" />
        {!compact && <><p className="line-clamp-4 font-serif text-[16px] leading-snug text-white">{book.title || 'Untitled book'}</p>
        <p className="line-clamp-2 text-[11px] text-white/70">{book.authorName}</p>
        <span className="mt-2 text-[10px] text-white/60">Cover unavailable</span></>}
      </div>}
  </div>;
}
