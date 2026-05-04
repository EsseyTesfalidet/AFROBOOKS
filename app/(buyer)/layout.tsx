import BuyerFooter from '@/components/buyer/BuyerFooter';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BuyerFooter />
    </>
  );
}
