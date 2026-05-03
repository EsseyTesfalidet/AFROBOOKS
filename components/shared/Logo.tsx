'use client';

import Link from 'next/link';

interface LogoProps {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-4xl',
};

export default function Logo({ href = '/', size = 'md' }: LogoProps) {
  return (
    <Link href={href} className={`font-display ${sizes[size]} tracking-wider select-none`}>
      <span className="text-white">AFRO</span>
      <span style={{ color: '#f5b800' }}>BOOKS</span>
    </Link>
  );
}
