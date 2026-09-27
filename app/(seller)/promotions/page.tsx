import SellerHeader from '@/components/seller/SellerHeader';
import PromotionWorkspace from '@/components/promotions/PromotionWorkspace';
import '@/app/(admin)/admin.css';

export default function PromotionsPage() {
  return (
    <div className="min-h-screen bg-[#10100f]">
      <SellerHeader />
      <PromotionWorkspace />
    </div>
  );
}
