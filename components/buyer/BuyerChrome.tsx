'use client';

import { usePathname } from 'next/navigation';
import BuyerBottomNav from '@/components/buyer/BuyerBottomNav';
import BuyerFooter from '@/components/buyer/BuyerFooter';
import BuyerProfileDrawer from '@/components/buyer/BuyerProfileDrawer';
import ReaderResumeBar from '@/components/buyer/ReaderResumeBar';
import BuyerSwipeNav from '@/components/buyer/BuyerSwipeNav';
import { getBuyerRouteState } from '@/components/buyer/buyerNavigation';

export default function BuyerChrome() {
  const pathname = usePathname();
  const routeState = getBuyerRouteState(pathname);

  return (
    <>
      {routeState.showBottomNav ? (
        <div className="h-[92px] sm:hidden" aria-hidden="true" />
      ) : null}
      <ReaderResumeBar />
      {routeState.showFooter ? <BuyerFooter /> : null}
      {routeState.showDrawer ? <BuyerProfileDrawer /> : null}
      {routeState.showSwipe ? <BuyerSwipeNav /> : null}
      {routeState.showBottomNav ? <BuyerBottomNav /> : null}
    </>
  );
}
