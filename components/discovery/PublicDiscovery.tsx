import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, Clapperboard, Headphones, Music2, Podcast, Sparkles } from 'lucide-react';
import type { DiscoveryItem } from '@/lib/server/discoveryPages';

const categoryLinks = [
  { href: '/african-books', label: 'Books', icon: BookOpen },
  { href: '/african-films', label: 'Films & docs', icon: Clapperboard },
  { href: '/african-music', label: 'Music', icon: Music2 },
  { href: '/african-podcasts', label: 'Podcasts', icon: Podcast },
  { href: '/african-audiobooks', label: 'Audiobooks', icon: Headphones },
];

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

function MediaCard({ item }: { item: DiscoveryItem }) {
  const isVideo = item.kind === 'video';
  return <article className="overflow-hidden rounded-2xl border border-white/10 bg-[#141414] transition hover:-translate-y-0.5 hover:border-[#d5a53a]/60">
    <Link href={item.href} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d5a53a]">
      <div className={`relative ${isVideo ? 'aspect-video' : 'aspect-[2/3]'} overflow-hidden bg-gradient-to-br from-[#292016] via-[#171717] to-[#111]`}>
        {item.image ? <Image src={item.image} alt={`Cover image for ${item.title}`} fill sizes={isVideo ? '(max-width: 700px) 90vw, 520px' : '(max-width: 700px) 42vw, 240px'} unoptimized className="object-cover" /> : <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-[#dfbd71]"><Sparkles aria-hidden="true" /><span className="font-display text-lg">{item.category}</span></div>}
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-xs text-white">{item.category}</span>
      </div>
      <div className="p-4">
        <h2 className="line-clamp-2 font-semibold text-white">{item.title}</h2>
        <p className="mt-1 truncate text-sm text-[#d5a53a]">{item.creator}</p>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#b7b2aa]">{item.description}</p>
        <p className="mt-3 text-xs text-[#888]">{item.language} · {isVideo ? 'Film & video' : item.kind === 'audio' ? 'Audio' : 'Book'}</p>
      </div>
    </Link>
  </article>;
}

export function PublicDiscovery({
  title,
  description,
  path,
  sections,
}: {
  title: string;
  description: string;
  path: string;
  sections: { title: string; items: DiscoveryItem[]; empty?: string }[];
}) {
  const list = sections.flatMap(section => section.items);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: `https://afrobs.com${path}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: list.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.title, url: `https://afrobs.com${item.href}` })),
    },
  };
  return <>
    <JsonLd data={jsonLd} />
    <div className="min-h-dvh bg-[#0e0e0e] text-[#f5f2eb]">
      <header className="border-b border-white/10 bg-[#101010]">
        <nav aria-label="AfroBooks discovery" className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="font-display text-xl font-bold tracking-wide text-white">Afro<span className="text-[#d5a53a]">Books</span></Link>
          <Link href="/african-creators" className="rounded-full border border-[#d5a53a]/50 px-4 py-2 text-sm text-[#efd18c] hover:bg-[#d5a53a]/10">For creators</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <section className="py-12 sm:py-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#d5a53a]">African stories in print, film & sound</p>
          <h1 className="max-w-4xl font-display text-4xl font-bold leading-tight text-white sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-[#b7b2aa] sm:text-lg">{description}</p>
          <nav aria-label="Explore AfroBooks" className="mt-7 flex flex-wrap gap-2">
            {categoryLinks.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-[#dedbd4] hover:border-[#d5a53a]/50"><Icon size={15} aria-hidden="true" />{label}</Link>)}
          </nav>
        </section>
        {sections.map(section => <section key={section.title} className="mb-14">
          <div className="mb-5 flex items-end justify-between gap-4"><h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">{section.title}</h2><Link href="/african-creators" className="inline-flex items-center gap-1 text-sm text-[#d5a53a]">Publish with us <ArrowRight size={15} /></Link></div>
          {section.items.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{section.items.map(item => <MediaCard key={`${item.kind}:${item.id}`} item={item} />)}</div> : <p className="rounded-2xl border border-dashed border-white/15 px-5 py-8 text-sm text-[#999]">{section.empty || 'New releases are coming soon. Creators can publish with AfroBooks.'}</p>}
        </section>)}
        <section className="rounded-3xl border border-[#d5a53a]/25 bg-gradient-to-br from-[#201a10] to-[#141414] p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d5a53a]">For African creators and storytellers</p>
          <h2 className="mt-3 font-display text-2xl font-bold text-white sm:text-3xl">Bring your work to a wider audience.</h2>
          <p className="mt-3 max-w-2xl leading-7 text-[#b7b2aa]">Publish books, films, documentaries, music, podcasts, and audiobooks. Build a creator page and reach readers and listeners around the world.</p>
          <Link href="/african-creators" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d5a53a] px-5 font-semibold text-[#17130b] hover:bg-[#e7bf60]">Explore creator tools <ArrowRight size={17} /></Link>
        </section>
      </main>
      <footer className="border-t border-white/10 px-5 py-7 text-center text-sm text-[#8d8981]">AfroBooks · African books, films, music, podcasts and audiobooks · <Link className="text-[#d5a53a]" href="/privacy">Privacy</Link> · <Link className="text-[#d5a53a]" href="/terms">Terms</Link></footer>
    </div>
  </>;
}

export function PublicRelease({
  item,
  trailerUrl,
  jsonLd,
  action,
}: {
  item: DiscoveryItem;
  trailerUrl?: string;
  jsonLd?: Record<string, unknown>;
  action: { href: string; label: string };
}) {
  return <>
    {jsonLd && <JsonLd data={jsonLd} />}
    <div className="min-h-dvh bg-[#0e0e0e] text-[#f5f2eb]">
      <header className="border-b border-white/10 bg-[#101010]"><nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/" className="font-display text-xl font-bold text-white">Afro<span className="text-[#d5a53a]">Books</span></Link><Link href={item.kind === 'book' ? '/african-books' : item.kind === 'video' ? '/african-films' : '/african-audio'} className="text-sm text-[#d5a53a]">Explore more</Link></nav></header>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#d5a53a]">{item.category} · {item.language}</p>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)] lg:items-start">
          <div>
            {trailerUrl ? <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black"><iframe className="absolute inset-0 h-full w-full" src={trailerUrl} title={`${item.title} official trailer`} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div> : item.image ? <div className={`relative mx-auto overflow-hidden rounded-2xl border border-white/10 bg-[#171717] ${item.kind === 'video' ? 'aspect-video w-full' : 'aspect-[2/3] max-w-sm'}`}><Image src={item.image} alt={`Cover image for ${item.title}`} fill sizes="(max-width: 700px) 92vw, 760px" unoptimized className="object-cover" /></div> : <div className="grid aspect-video place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-[#2a2112] to-[#141414] text-[#d5a53a]">{item.category}</div>}
            <h1 className="mt-6 font-display text-3xl font-bold leading-tight text-white sm:text-5xl">{item.title}</h1>
            <p className="mt-3 text-[#d5a53a]">By {item.creator}</p>
            <p className="mt-6 whitespace-pre-line text-base leading-8 text-[#c4c0b8]">{item.description}</p>
            <Link href={action.href} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#d5a53a] px-5 font-semibold text-[#17130b] hover:bg-[#e7bf60]">{action.label}<ArrowRight size={17} /></Link>
            <p className="mt-3 text-sm text-[#8d8981]">Sign in to AfroBooks for full access, purchases, and your personal library.</p>
          </div>
          <aside className="rounded-2xl border border-white/10 bg-[#141414] p-5 sm:p-6"><h2 className="font-display text-xl font-semibold text-white">About this {item.kind === 'book' ? 'book' : item.kind === 'video' ? 'film' : 'audio'}</h2><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-[#888]">Creator</dt><dd className="mt-1 text-[#e9e5dc]">{item.creator}</dd></div><div><dt className="text-[#888]">Format</dt><dd className="mt-1 text-[#e9e5dc]">{item.category}</dd></div><div><dt className="text-[#888]">Language</dt><dd className="mt-1 text-[#e9e5dc]">{item.language}</dd></div>{item.publishedAt && <div><dt className="text-[#888]">Published</dt><dd className="mt-1 text-[#e9e5dc]"><time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</time></dd></div>}</dl><Link href="/african-creators" className="mt-6 inline-flex items-center gap-1 text-sm text-[#d5a53a]">Publish your work <ArrowRight size={14} /></Link></aside>
        </div>
      </main>
      <footer className="border-t border-white/10 px-5 py-7 text-center text-sm text-[#8d8981]">AfroBooks · <Link className="text-[#d5a53a]" href="/privacy">Privacy</Link> · <Link className="text-[#d5a53a]" href="/terms">Terms</Link></footer>
    </div>
  </>;
}
