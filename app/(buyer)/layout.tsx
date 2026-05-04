import BuyerFooter from '@/components/buyer/BuyerFooter';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Spacer so content isn't hidden behind the fixed mobile bottom nav */}
      <div className="h-[60px] sm:hidden" aria-hidden="true" />
      <BuyerFooter />
    </>
  );
}
