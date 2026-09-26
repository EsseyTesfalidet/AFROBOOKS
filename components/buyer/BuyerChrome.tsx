'use client';

import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import ProfileLinkHandler from '@/components/shared/ProfileLinkHandler';
import CatalogSync from '@/components/buyer/CatalogSync';
import BuyerBottomNav from '@/components/buyer/BuyerBottomNav';
import BuyerFooter from '@/components/buyer/BuyerFooter';
import BuyerProfileDrawer from '@/components/buyer/BuyerProfileDrawer';
import ReaderResumeBar from '@/components/buyer/ReaderResumeBar';
import { getBuyerRouteState } from '@/components/buyer/buyerNavigation';

export default function BuyerChrome() {
  const pathname = usePathname();
  const routeState = getBuyerRouteState(pathname);

  return (
    <>
      <CatalogSync />
      <Suspense><ProfileLinkHandler /></Suspense>
      {routeState.showBottomNav ? (
        <div className="h-[92px] sm:hidden" aria-hidden="true" />
      ) : null}
      <ReaderResumeBar />
      {routeState.showFooter ? <BuyerFooter /> : null}
      {routeState.showDrawer ? <BuyerProfileDrawer /> : null}
      {routeState.showBottomNav ? <BuyerBottomNav /> : null}
    </>
  );
}
