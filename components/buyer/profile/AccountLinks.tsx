import Link from 'next/link';
import { ChevronRight, Compass, Gift, HelpCircle, ShoppingCart, Users } from 'lucide-react';

const links = [
  { href: '/discover', label: 'Discover books', icon: Compass },
  { href: '/community', label: 'Community', icon: Users },
  { href: '/cart', label: 'My cart', icon: ShoppingCart },
  { href: '/gifts', label: 'Book gifts', icon: Gift },
  { href: '/about-help', label: 'About & Help', icon: HelpCircle },
];

export default function AccountLinks({ onNavigate }: { onNavigate: () => void }) {
  return <nav aria-label="Explore and help" className="mt-6 divide-y divide-white/10 border-y border-white/10">
    {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={onNavigate} className="flex min-h-14 items-center gap-4 rounded-lg px-1 py-3 text-sm text-[#c6c2b8] hover:text-[#e5c68e] focus-visible:outline focus-visible:outline-[#f5b800]">
      <Icon size={18} aria-hidden="true" className="shrink-0 text-[#a39f97]" /><span className="flex-1">{label}</span><ChevronRight size={16} aria-hidden="true" />
    </Link>)}
  </nav>;
}
