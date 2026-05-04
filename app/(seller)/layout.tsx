import SellerProfileDrawer from '@/components/seller/SellerProfileDrawer';
import SellerSwipeNav from '@/components/seller/SellerSwipeNav';

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="h-[60px] sm:hidden" aria-hidden="true" />
      <SellerProfileDrawer />
      <SellerSwipeNav />
    </>
  );
}
