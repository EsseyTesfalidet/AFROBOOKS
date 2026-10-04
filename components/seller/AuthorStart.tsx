'use client';

import { useInstalledApp } from '@/hooks/useInstalledApp';
import AuthorWebStart from './AuthorWebStart';
import MobileAuthorStart from './MobileAuthorStart';

export default function AuthorStart() {
  return useInstalledApp() ? <MobileAuthorStart /> : <AuthorWebStart />;
}
