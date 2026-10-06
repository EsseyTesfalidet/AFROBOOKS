'use client';

import { useSyncExternalStore } from 'react';
import { ExternalLink } from 'lucide-react';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { isSeparateAccount, SEPARATE_ACCOUNT_HREF } from '@/lib/auth/tabAccount';

const subscribe = () => () => {};

export function SeparateAccountNotice() {
  const separate = useSyncExternalStore(subscribe, isSeparateAccount, () => false);
  if (!separate) return null;
  return <p className="my-3 text-sm leading-relaxed text-[#c1a56c]">This account stays in this tab. Your other tabs stay signed in to their own accounts.</p>;
}

export default function SeparateAccountLink() {
  const installed = useInstalledApp();
  if (installed) return null;
  return <div className="py-2"><SeparateAccountNotice /><a href={SEPARATE_ACCOUNT_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm text-[#c1a56c] hover:underline">Sign in to another account<ExternalLink size={15} aria-hidden="true" /><span className="sr-only"> (opens a separate tab)</span></a></div>;
}
