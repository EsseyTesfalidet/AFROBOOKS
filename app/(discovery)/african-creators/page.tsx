import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Clapperboard, Headphones, Music2, Mic2 } from 'lucide-react';
import { getPublicVideoCreators } from '@/lib/server/discoveryPages';
import { JsonLd } from '@/components/discovery/PublicDiscovery';
import { discoveryMetadata } from '@/lib/seo/discoveryMetadata';

export const revalidate = 1800;
export const metadata: Metadata = discoveryMetadata('Publish African Books, Films, Music & Podcasts', 'Join AfroBooks as an African author, filmmaker, musician, podcaster, or audiobook creator. Share your work and reach a global audience.', '/african-creators');

const formats = [
  { title: 'Books & stories', detail: 'Publish books, magazines, and short stories.', icon: BookOpen },
  { title: 'Films & documentaries', detail: 'Share films, documentaries, and meaningful video stories.', icon: Clapperboard },
  { title: 'Music', detail: 'Release songs, albums, and music videos.', icon: Music2 },
  { title: 'Podcasts', detail: 'Publish conversations, interviews, and audio series.', icon: Mic2 },
  { title: 'Audiobooks', detail: 'Bring books and spoken stories to listeners.', icon: Headphones },
];

export default async function AfricanCreatorsPage() {
  const creators = await getPublicVideoCreators(18);
  return <div className="min-h-dvh bg-[#0e0e0e] text-[#f5f2eb]">
    <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Publish African Books, Films, Music & Podcasts', description: 'Creator publishing on AfroBooks.', url: 'https://afrobs.com/african-creators' }} />
    <header className="border-b border-white/10 bg-[#101010]"><nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/" className="font-display text-xl font-bold text-white">Afro<span className="text-[#d5a53a]">Books</span></Link><Link href="/african-books" className="text-sm text-[#d5a53a]">Explore stories</Link></nav></header>
    <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d5a53a]">For African creators and storytellers</p>
      <h1 className="mt-4 max-w-4xl font-display text-4xl font-bold leading-tight text-white sm:text-6xl">Your work deserves a wider audience.</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-[#b7b2aa]">AfroBooks brings African books, films, documentaries, music, podcasts, and audiobooks together. Build your creator presence and share your work with readers and listeners around the world.</p>
      <Link href="/signup?role=seller" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#d5a53a] px-5 font-semibold text-[#17130b]">Start creating on AfroBooks <ArrowRight size={17} /></Link>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{formats.map(({ title, detail, icon: Icon }) => <article key={title} className="rounded-2xl border border-white/10 bg-[#141414] p-5"><Icon className="text-[#d5a53a]" aria-hidden="true" /><h2 className="mt-4 font-display text-xl font-semibold text-white">{title}</h2><p className="mt-2 leading-6 text-[#b7b2aa]">{detail}</p></article>)}</div>
      {creators.length > 0 && <section className="mt-14"><h2 className="font-display text-2xl font-semibold text-white">Meet video creators</h2><ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{creators.map(creator => <li key={creator.id}><Link href={creator.href} className="block rounded-xl border border-white/10 bg-[#141414] p-4 text-[#e9e5dc] hover:border-[#d5a53a]/50">{creator.name}<span className="mt-1 block text-sm text-[#d5a53a]">View published work <ArrowRight className="ml-1 inline" size={13} /></span></Link></li>)}</ul></section>}
    </main>
    <footer className="border-t border-white/10 px-5 py-7 text-center text-sm text-[#8d8981]">AfroBooks · <Link className="text-[#d5a53a]" href="/privacy">Privacy</Link> · <Link className="text-[#d5a53a]" href="/terms">Terms</Link></footer>
  </div>;
}
