'use client';

import Link from 'next/link';
import Image from 'next/image';

interface LogoProps {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
}

const sizes = {
  sm: { mark: 'h-8 w-8', wordmark: 'text-[19px]', gap: 'gap-1.5' },
  md: { mark: 'h-11 w-11', wordmark: 'text-[28px]', gap: 'gap-2' },
  lg: { mark: 'h-14 w-14', wordmark: 'text-[36px]', gap: 'gap-2.5' },
};

export default function Logo({ href = '/', size = 'md', compact = false }: LogoProps) {
  const scale = sizes[size];
  return (
    <Link
      href={href}
      aria-label="AfroBooks"
      className={`inline-flex min-h-11 shrink-0 select-none items-center justify-center rounded-md align-middle ${scale.gap} transition-opacity hover:opacity-80 ${compact ? 'min-w-11' : ''}`}
    >
      <Image src="/brand/afrobooks-mark.svg" alt="" width={64} height={64} className={`${scale.mark} shrink-0`} aria-hidden="true" />
      {!compact && <span aria-hidden="true" className={`font-body ${scale.wordmark} whitespace-nowrap font-semibold leading-none tracking-[-0.055em] text-[#f5f2eb]`}>AfroBooks</span>}
    </Link>
  );
}
