export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Spacer so content clears the fixed mobile bottom nav */}
      <div className="h-[60px] sm:hidden" aria-hidden="true" />
    </>
  );
}
