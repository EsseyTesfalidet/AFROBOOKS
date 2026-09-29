import type { Metadata } from 'next';
import '@/components/community/community.css';

export const metadata: Metadata = {
  title: 'Community | AfroBooks',
  description: 'Share an experience in our weekly question, or ask the AfroBooks community to help you find a forgotten memory.',
  openGraph: { title: 'AfroBooks Community', description: 'Different places. Shared memories. Join the conversation.' },
};

export default function CommunityLayout({ children }: { children: React.ReactNode }) { return children; }
