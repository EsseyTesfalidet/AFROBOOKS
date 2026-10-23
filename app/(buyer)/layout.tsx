import type { Metadata } from 'next';
import BuyerChrome from '@/components/buyer/BuyerChrome';

export const metadata: Metadata = {
  title: 'African Books, Films, Music & Stories',
  description: 'Read African books, watch films and documentaries, and listen to music, podcasts and audiobooks from independent creators.',
  openGraph: {
    title: 'African Books, Films, Music & Stories — AfroNarra',
    description: 'Read, watch and listen to African authors and creators on AfroNarra.',
  },
};

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BuyerChrome />
    </>
  );
}
