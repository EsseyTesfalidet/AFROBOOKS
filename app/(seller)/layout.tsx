import SellerProfileDrawer from '@/components/seller/SellerProfileDrawer';
import { Suspense } from 'react';
import ProfileLinkHandler from '@/components/shared/ProfileLinkHandler';

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="h-[calc(64px+env(safe-area-inset-bottom))] md:hidden" aria-hidden="true" />
      <SellerProfileDrawer />
      <Suspense><ProfileLinkHandler seller /></Suspense>
    </>
  );
}
