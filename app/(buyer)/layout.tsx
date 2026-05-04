import type { Metadata } from 'next';
import BuyerFooter from '@/components/buyer/BuyerFooter';
import BuyerProfileDrawer from '@/components/buyer/BuyerProfileDrawer';
import BuyerSwipeNav from '@/components/buyer/BuyerSwipeNav';

export const metadata: Metadata = {
  title: 'Browse African Ebooks',
  description: 'Discover and buy ebooks by African authors. Thousands of titles across fiction, history, science, fantasy, romance, and more.',
  openGraph: {
    title: 'Browse African Ebooks — AfroBooks',
    description: 'Discover and buy ebooks by African authors on AfroBooks.',
  },
};

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="h-[60px] sm:hidden" aria-hidden="true" />
      <BuyerFooter />
      <BuyerProfileDrawer />
      <BuyerSwipeNav />
    </>
  );
}
