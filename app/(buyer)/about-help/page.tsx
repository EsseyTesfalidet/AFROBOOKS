import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Mail, ShieldCheck, FileText } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import Logo from '@/components/shared/Logo';
import { LEGAL_CONTACT } from '@/lib/legal';
import { version } from '@/package.json';

export const metadata: Metadata = { title: 'About & Help', description: 'About AfroBooks, contact support, privacy and app information.' };

export default function AboutHelpPage() {
  const build = /^[a-f0-9]{7,40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA ?? '') ? process.env.VERCEL_GIT_COMMIT_SHA!.slice(0, 7) : null;
  return <div className="min-h-dvh bg-[#0e0e0e] text-[#f5f2eb]">
    <BuyerHeader />
    <main className="mx-auto max-w-2xl space-y-8 px-5 py-8 sm:px-8 sm:py-12">
      <Link href="/browse" className="inline-flex min-h-11 items-center gap-2 text-sm text-[#b9b5ac] hover:text-white"><ArrowLeft size={16} aria-hidden="true" />Back to browse</Link>
      <header><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c1a56c]">Here for your next chapter</p><h1 className="mt-3 font-display text-4xl">About & Help</h1></header>
      <section className="rounded-2xl border border-[#c5a56a]/20 bg-[#171814] p-6">
        <Logo href="/browse" size="sm" />
        <h2 className="mt-6 text-xl font-semibold">African voices. Stories for everyone.</h2>
        <p className="mt-3 text-sm leading-7 text-[#b9b5ac]">AfroBooks is a digital marketplace dedicated to African storytelling. We connect readers with African authors and give their stories a home, from books and short stories to magazines.</p>
      </section>
      <section aria-labelledby="help-title">
        <h2 id="help-title" className="text-lg font-semibold">How can we help?</h2>
        <p className="mt-2 text-sm leading-6 text-[#a39f97]">For help with your account, purchases, reading or publishing, contact our support team.</p>
        <a href={`mailto:${LEGAL_CONTACT}?subject=AfroBooks%20support`} className="mt-4 flex min-h-16 items-center gap-3 rounded-xl border border-white/10 p-4 hover:border-[#c1a56c] focus-visible:outline focus-visible:outline-[#f5b800]">
          <Mail size={20} aria-hidden="true" className="shrink-0 text-[#e5c68e]" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Contact support</span><span className="mt-1 block break-all text-xs text-[#a39f97]">{LEGAL_CONTACT}</span></span><ArrowUpRight size={18} aria-hidden="true" className="shrink-0" />
        </a>
      </section>
      <nav aria-label="Information and policies" className="divide-y divide-white/10 border-y border-white/10">
        {[{ href: '/privacy', label: 'Privacy information', Icon: ShieldCheck }, { href: '/terms', label: 'Terms of use', Icon: FileText }].map(({ href, label, Icon }) => <Link key={href} href={href} className="flex min-h-16 items-center gap-3 rounded-lg py-4 text-sm hover:text-[#e5c68e] focus-visible:outline focus-visible:outline-[#f5b800]"><Icon size={18} aria-hidden="true" className="text-[#a39f97]" /><span className="flex-1">{label}</span><ArrowUpRight size={16} aria-hidden="true" /></Link>)}
      </nav>
      <p className="text-xs leading-6 text-[#a39f97]">AfroBooks web app · Version {version}{build ? ` · Build ${build}` : ''}</p>
    </main>
  </div>;
}
