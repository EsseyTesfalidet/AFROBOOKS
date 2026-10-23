import type { Metadata } from 'next';
import '@/components/community/community.css';

export const metadata: Metadata = {
  title: 'Community | AfroNarra',
  description: 'Share an experience in our weekly question, or ask the AfroNarra community to help you find a forgotten memory.',
  openGraph: { title: 'AfroNarra Community', description: 'Different places. Shared memories. Join the conversation.' },
};

export default function CommunityLayout({ children }: { children: React.ReactNode }) { return children; }
