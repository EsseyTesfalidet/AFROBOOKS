import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import Logo from '@/components/shared/Logo';
import './buyer-chrome.css';

const FOOTER_GROUPS = [
  { title: 'Explore', links: [
    { label: 'Browse books', href: '/browse' },
    { label: 'Discover', href: '/discover' },
    { label: 'Community', href: '/community' },
  ] },
  { title: 'Your reading', links: [
    { label: 'Your library', href: '/library' },
    { label: 'Book gifts', href: '/gifts' },
    { label: 'Your cart', href: '/cart' },
  ] },
];

export default function BuyerFooter() {
  return (
    <footer className="buyer-footer">
      <div className="buyer-footer-inner">
        <div className="buyer-footer-main">
          <div className="buyer-footer-brand">
            <Logo href="/browse" size="sm" />
            <p>African voices.<br /><span>Stories for everyone.</span></p>
            <span className="buyer-footer-description">Discover your next read, support its author, and find a little connection along the way.</span>
            <Link href="/#about" className="buyer-footer-about">Our story <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
          {FOOTER_GROUPS.map(({ title, links }) => (
            <nav key={title} aria-label={title} className="buyer-footer-links">
              <h2>{title}</h2>
              {links.map(({ label, href }) => <Link key={href} href={href}>{label}</Link>)}
            </nav>
          ))}
        </div>
        <div className="buyer-footer-bottom">
          <p>© {new Date().getFullYear()} AfroBooks. All rights reserved.</p>
          <nav aria-label="Legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms of use</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
