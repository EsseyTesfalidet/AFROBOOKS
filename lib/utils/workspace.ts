import type { User } from '@/types/user';

export type WorkspaceRole = User['activeRole'];

export function hasAuthorWorkspace(userProfile?: Pick<User, 'role'> | null) {
  return userProfile?.role === 'seller' || userProfile?.role === 'both';
}

export function getWorkspaceLabel(activeRole: WorkspaceRole) {
  return activeRole === 'seller' ? 'Author Studio' : 'Reader';
}

export function getWorkspaceDestination(activeRole: WorkspaceRole) {
  return activeRole === 'seller' ? '/dashboard' : '/browse';
}
