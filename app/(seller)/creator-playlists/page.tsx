import SellerHeader from '@/components/seller/SellerHeader';
import CreatorPlaylistsStudio from '@/components/experience/CreatorPlaylistsStudio';

export const metadata = { title: 'Playlists & series — AfroBooks Author Studio' };

export default function CreatorPlaylistsPage() {
  return <div className="app-canvas min-h-screen bg-[#10100f] text-[#f5f2eb]"><SellerHeader /><CreatorPlaylistsStudio /></div>;
}
