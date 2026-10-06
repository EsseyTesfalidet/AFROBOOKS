'use client';
import { useState } from 'react';
import Image from 'next/image';
import { Music2, Mic2, BookOpen } from 'lucide-react';
export default function AudioArtwork({ category, coverUrl, mini = false }: { category: string; coverUrl?: string; mini?: boolean }) {
  const [failed, setFailed] = useState('');
  const Icon = category === 'Music' ? Music2 : category === 'Podcasts' ? Mic2 : BookOpen;
  return <span className={mini ? 'listen-art-mini' : 'listen-art'} data-category={category} aria-hidden="true">{coverUrl && failed !== coverUrl ? <Image src={coverUrl} alt="" width={144} height={144} unoptimized onError={() => setFailed(coverUrl)} /> : <Icon size={mini ? 22 : 34} strokeWidth={1.3} />}</span>;
}
