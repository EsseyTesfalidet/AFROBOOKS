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
import { useInstalledApp } from '@/hooks/useInstalledApp';

export default function BuyerChrome() {
  const pathname = usePathname();
  const installed = useInstalledApp();
  const routeState = getBuyerRouteState(pathname);

  return (
    <>
      <CatalogSync />
      <Suspense><ProfileLinkHandler /></Suspense>
      <ReaderResumeBar />
      {routeState.showFooter && !installed ? <BuyerFooter /> : null}
      {routeState.showBottomNav ? (
        <div className="buyer-nav-space h-[92px] sm:hidden" aria-hidden="true" />
      ) : null}
      {routeState.showDrawer ? <BuyerProfileDrawer /> : null}
      {routeState.showBottomNav ? <BuyerBottomNav /> : null}
    </>
  );
}
