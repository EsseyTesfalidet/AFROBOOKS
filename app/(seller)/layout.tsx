import SellerProfileDrawer from '@/components/seller/SellerProfileDrawer';

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="h-[60px] sm:hidden" aria-hidden="true" />
      <SellerProfileDrawer />
    </>
  );
}
