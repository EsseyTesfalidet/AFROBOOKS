import Link from 'next/link';

export default function CommunityInvitation() {
  return <aside className="rounded-2xl border border-[#3d3528] bg-[#1b1914] p-6" aria-label="Join the AfroBooks community">
    <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#dbb878]">AfroBooks Community</p>
    <h2 className="mt-3 text-xl font-semibold text-[#f5f2eb]">Every home has a story.</h2>
    <p className="mt-3 text-sm leading-relaxed text-[#b5b0a6]">Join our weekly conversation or ask for help finding a forgotten memory.</p>
    <Link href="/community" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#e9bd73] underline underline-offset-4">Explore the community →</Link>
  </aside>;
}
