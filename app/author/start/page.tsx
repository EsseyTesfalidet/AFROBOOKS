import type { Metadata } from 'next';
import AuthorWebStart from '@/components/seller/AuthorWebStart';

export const metadata: Metadata = { title: 'Become an author — AfroBooks' };

export default function AuthorStartPage() { return <AuthorWebStart />; }
