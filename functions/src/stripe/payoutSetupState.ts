import { accountReadiness, type ConnectedAccount } from './accountReadiness';

export type PayoutSetupState = 'needs_setup' | 'needs_details' | 'reviewing' | 'ready' | 'unavailable';

export function payoutSetupState(account: ConnectedAccount | null): PayoutSetupState {
  if (!account) return 'needs_setup';
  if (account.deleted) return 'unavailable';
  if (accountReadiness(account).stripeAccountStatus === 'active') return 'ready';
  const requirements = account.requirements;
  const reason = requirements?.disabled_reason;
  if (reason && !['requirements.past_due', 'requirements.pending_verification'].includes(reason)) return 'unavailable';
  const pending = new Set(requirements?.pending_verification ?? []);
  const due = [...(requirements?.currently_due ?? []), ...(requirements?.past_due ?? [])];
  if (due.some(field => !pending.has(field))) return 'needs_details';
  if (pending.size || reason === 'requirements.pending_verification') return 'reviewing';
  if (account.details_submitted !== true) return 'needs_details';
  // No outstanding action is exposed. Do not tell the author to resubmit bank details.
  return 'reviewing';
}
