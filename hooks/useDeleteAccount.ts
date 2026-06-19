'use client';

import { useState } from 'react';
import { deleteCurrentAccount } from '@/lib/firebase/auth';
import { useAuthStore } from '@/store/authStore';

function getDeletePrompt(role: string | undefined) {
  if (role === 'seller' || role === 'both') {
    return 'Permanently delete your account, your published books, and related data? This cannot be undone.';
  }

  return 'Permanently delete your account and related data? This cannot be undone.';
}

export function useDeleteAccount(onDeleted?: () => void) {
  const userProfile = useAuthStore((state) => state.userProfile);
  const reset = useAuthStore((state) => state.reset);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function handleDeleteAccount() {
    if (!userProfile || deletingAccount) return false;

    setDeleteError('');

    const confirmed = window.confirm(getDeletePrompt(userProfile.role));
    if (!confirmed) {
      return false;
    }

    setDeletingAccount(true);

    try {
      await deleteCurrentAccount();
      reset();
      onDeleted?.();
      window.location.assign('/signup');
      return true;
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete your account.');
      return false;
    } finally {
      setDeletingAccount(false);
    }
  }

  return {
    deletingAccount,
    deleteError,
    handleDeleteAccount,
  };
}
