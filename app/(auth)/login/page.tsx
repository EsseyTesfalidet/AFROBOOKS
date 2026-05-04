import type { Metadata } from 'next';
import LoginForm from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your AfroBooks account to browse and read ebooks by African authors.',
};

export default function LoginPage() {
  return <LoginForm />;
}
