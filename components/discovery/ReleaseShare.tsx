'use client';

import { useState } from 'react';
import { Copy, Share2 } from 'lucide-react';

export default function ReleaseShare({ title, href, text }: { title: string; href: string; text: string }) {
  const [message, setMessage] = useState('');
  async function share(copy = false) {
    setMessage('');
    const url = new URL(href, 'https://afrobs.com').href;
    try {
      if (!copy && navigator.share) await navigator.share({ title, text: `Discover ${title} on AfroNarra.`, url });
      else { await navigator.clipboard.writeText(copy ? text : url); setMessage(copy ? 'Caption and link copied.' : 'Link copied.'); }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setMessage('You can copy the page address from your browser to share this release.');
    }
  }
  return <div className="mt-5">
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={() => void share()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm text-[#dedbd4]"><Share2 size={16} aria-hidden="true" />Share this release</button>
      <button type="button" onClick={() => void share(true)} className="inline-flex min-h-11 items-center gap-2 px-2 text-sm text-[#d5a53a]"><Copy size={15} aria-hidden="true" />Copy caption & link</button>
    </div>
    <p role="status" className="mt-2 text-sm text-[#b7b2aa]">{message}</p>
  </div>;
}
