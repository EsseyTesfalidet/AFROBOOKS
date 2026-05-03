'use client';

import { useRouter } from 'next/navigation';
import { Lock, ShieldCheck } from 'lucide-react';
import { centsToDisplay } from '@/lib/utils/formatCurrency';

interface Props {
  bookId: string;
  bookTitle: string;
  price: number;
}

export default function PreviewGate({ bookId, bookTitle, price }: Props) {
  const router = useRouter();

  return (
    <div
      className="mx-auto max-w-lg my-12 p-8 rounded-xl text-center space-y-4"
      style={{ border: '1.5px solid #f5b800', background: '#1a1500' }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
        style={{ background: '#2e2000' }}
      >
        <Lock size={20} style={{ color: '#f5b800' }} />
      </div>
      <h3 className="font-display text-display-sm text-white">End of Free Preview</h3>
      <p className="text-sm leading-relaxed" style={{ color: '#aaa' }}>
        You've reached the end of the free preview for <strong className="text-white">{bookTitle}</strong>.
        Purchase to continue reading in the AfroBooks reader.
      </p>
      <p className="text-xs flex items-center justify-center gap-1.5" style={{ color: '#555' }}>
        <ShieldCheck size={12} />
        No downloads — your reading is protected.
      </p>
      <button
        type="button"
        onClick={() => router.push(`/book/${bookId}`)}
        className="w-full py-3 rounded-xl text-sm font-medium"
        style={{ background: '#e8442a', color: '#fff' }}
      >
        Buy &amp; Continue — {centsToDisplay(price)}
      </button>
    </div>
  );
}
