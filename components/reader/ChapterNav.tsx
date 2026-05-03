'use client';

import type { Chapter } from '@/types/book';

interface Props {
  chapters: Chapter[];
  current: number;
  onSelect: (chapterNumber: number) => void;
}

export default function ChapterNav({ chapters, current, onSelect }: Props) {
  return (
    <select
      value={current}
      onChange={(e) => onSelect(parseInt(e.target.value, 10))}
      className="px-3 py-1.5 rounded-lg border text-sm"
      style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}
    >
      {chapters.map((ch) => (
        <option key={ch.id} value={ch.chapterNumber}>
          Ch. {ch.chapterNumber}: {ch.title}
        </option>
      ))}
    </select>
  );
}
