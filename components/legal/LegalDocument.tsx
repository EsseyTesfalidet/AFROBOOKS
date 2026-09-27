import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import Logo from '@/components/shared/Logo';
import { LEGAL_VERSION, LEGAL_CONTACT } from '@/lib/legal';

type Section = { id: string; title: string; content: ReactNode };

export default function LegalDocument({
  kind,
  title,
  introduction,
  highlights,
  sections,
}: {
  kind: 'terms' | 'privacy';
  title: string;
  introduction: string;
  highlights: { title: string; text: string }[];
  sections: Section[];
}) {
  return (
    <div className="min-h-screen bg-[#10100f] text-[#f5f2eb] selection:bg-[#c5a56a]/30">
      <a
        href="#legal-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-[#f5f2eb] focus:p-3 focus:text-[#10100f]"
      >
        Skip to document
      </a>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#10100f]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Logo size="sm" href="/" />
          <Link
            href="/browse"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-[#c6c2b8] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c5a56a]"
          >
            Explore books <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <main id="legal-content" className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
        <nav
          aria-label="Legal documents"
          className="mb-10 flex gap-7 border-b border-white/10 text-sm"
        >
          {[
            { href: '/terms', label: 'Terms of use', key: 'terms' },
            { href: '/privacy', label: 'Privacy information', key: 'privacy' },
          ].map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={kind === item.key ? 'page' : undefined}
              className={`inline-flex min-h-12 items-center border-b-2 pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c5a56a] ${kind === item.key ? 'border-[#c5a56a] text-[#f5f2eb]' : 'border-transparent text-[#a8a49c] hover:text-white'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c5a56a]">
            Trust & transparency
          </p>
          <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight sm:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#b9b5ac] sm:text-lg sm:leading-8">
            {introduction}
          </p>
          <p className="mt-5 text-xs text-[#a8a49c]">
            Last updated <time dateTime={LEGAL_VERSION}>September 27, 2026</time>
          </p>
        </div>
        <div
          className="my-10 grid gap-6 border-y border-white/10 py-7 sm:my-12 sm:grid-cols-3 sm:gap-8"
          aria-label="At a glance"
        >
          {highlights.map((item) => (
            <div key={item.title}>
              <h2 className="text-sm font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#a8a49c]">{item.text}</p>
            </div>
          ))}
        </div>
        <div className="grid items-start gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <aside className="lg:sticky lg:top-24">
            <details className="rounded-xl border border-white/10 px-4 lg:hidden">
              <summary className="min-h-12 cursor-pointer py-3 text-sm text-[#c6c2b8]">
                On this page
              </summary>
              <nav aria-label="Document sections" className="grid pb-3">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="flex min-h-11 items-center text-sm text-[#b9b5ac] underline decoration-white/15 underline-offset-4"
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            </details>
            <nav aria-label="Document sections" className="hidden lg:block">
              <p className="mb-4 text-xs font-medium uppercase tracking-[0.15em] text-[#a8a49c]">
                On this page
              </p>
              <ol className="space-y-1">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="flex min-h-10 items-baseline gap-3 py-2 text-[13px] leading-5 text-[#b9b5ac] hover:text-[#f5f2eb]"
                    >
                      <span className="text-xs tabular-nums text-[#a8a49c]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
          <article className="min-w-0 max-w-3xl space-y-10 sm:space-y-12">
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-title`}
                className="scroll-mt-24"
              >
                <h2
                  id={`${section.id}-title`}
                  className="mb-4 flex items-baseline gap-3 text-xl font-semibold tracking-tight"
                >
                  <span className="text-xs font-normal tabular-nums text-[#c5a56a]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {section.title}
                </h2>
                <div className="space-y-4 text-[15px] leading-7 text-[#b9b5ac] [&_a]:break-words [&_a]:text-[#e5c68e] [&_a]:underline [&_a]:decoration-[#c5a56a]/40 [&_a]:underline-offset-4 [&_li]:pl-1 [&_li]:marker:text-[#c5a56a] [&_strong]:font-medium [&_strong]:text-[#e5e1d8] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                  {section.content}
                </div>
              </section>
            ))}
            <div className="border-t border-white/10 pt-7 text-sm leading-6 text-[#a8a49c]">
              <p>Need help with your account, a purchase, or your information?</p>
              <a
                href={`mailto:${LEGAL_CONTACT}`}
                className="mt-2 inline-flex min-h-11 items-center break-all text-[#e5c68e] underline decoration-[#c5a56a]/40 underline-offset-4"
              >
                {LEGAL_CONTACT}
              </a>
            </div>
          </article>
        </div>
      </main>
      <footer className="border-t border-white/10 px-5 py-7 text-xs text-[#a8a49c]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} AfroBooks</p>
          <p>A place for stories. Built on trust.</p>
        </div>
      </footer>
    </div>
  );
}
