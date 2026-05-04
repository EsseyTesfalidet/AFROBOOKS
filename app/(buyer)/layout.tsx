import BuyerFooter from '@/components/buyer/BuyerFooter';
import BuyerProfileDrawer from '@/components/buyer/BuyerProfileDrawer';
import BuyerSwipeNav from '@/components/buyer/BuyerSwipeNav';

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
