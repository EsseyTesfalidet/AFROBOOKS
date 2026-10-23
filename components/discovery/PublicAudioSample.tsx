'use client';

import { useState } from 'react';

export default function PublicAudioSample({ id, title }: { id: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return <section className="mt-7 rounded-2xl border border-[#d5a53a]/30 bg-[#19170f] p-5" aria-labelledby="audio-sample-title">
    <h2 id="audio-sample-title" className="font-display text-xl text-white">Listen to a free sample</h2>
    <p className="mb-4 mt-2 text-sm leading-6 text-[#b7b2aa]">Up to the first minute. No account needed.</p>
    <audio key={attempt} controls preload="none" aria-label={`Free sample of ${title}`} className="w-full max-w-full" src={`/api/audio/public-preview?id=${encodeURIComponent(id)}`} onError={() => setFailed(true)} />
    {failed && <div className="mt-3 text-sm text-[#dedbd4]"><p role="status">This sample could not be loaded. Check your connection and try again.</p><button type="button" className="mt-2 min-h-11 underline" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Retry sample</button></div>}
  </section>;
}
