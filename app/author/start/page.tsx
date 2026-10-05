import type { Metadata } from 'next';
import { Suspense } from 'react';
import AuthorStart from '@/components/seller/AuthorStart';

export const metadata: Metadata = { title: 'Become an author — AfroBooks' };

export default function AuthorStartPage() { return <Suspense fallback={<p role="status">Opening your studio…</p>}><AuthorStart /></Suspense>; }
