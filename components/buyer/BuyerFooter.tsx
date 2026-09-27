import Link from 'next/link';

export default function BuyerFooter() {
  return (
    <footer
      className="hidden sm:block border-t"
      style={{ color: '#555', borderColor: 'rgba(255,255,255,0.06)', background: '#0b0b0b' }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 text-xs">
        <p>© 2026 AfroBooks. All rights reserved.</p>
        <nav aria-label="Legal" className="flex items-center gap-5 text-[#a8a49c]">
          <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-white">
            Terms of use
          </Link>
        </nav>
      </div>
    </footer>
  );
}
