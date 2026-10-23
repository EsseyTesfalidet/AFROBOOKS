import type { Metadata } from 'next';
import LoginForm from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your AfroNarra account to read, watch and listen to African authors and creators.',
};

export default function LoginPage() {
  return <LoginForm />;
}
