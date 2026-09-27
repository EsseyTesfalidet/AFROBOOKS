export interface ConnectedAccount {
  id: string;
  deleted?: boolean | void;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  capabilities?: { transfers?: string };
  requirements?: { disabled_reason?: string | null; currently_due?: string[] | null; past_due?: string[] | null } | null;
  country?: string;
  metadata?: { [key: string]: string } | null;
}

export function accountReadiness(account: ConnectedAccount) {
  const ready = !account.deleted && account.details_submitted === true && account.payouts_enabled === true &&
    account.capabilities?.transfers === 'active' && !account.requirements?.disabled_reason;
  return {
    stripeAccountId: account.id,
    stripeAccountStatus: ready ? 'active' as const : 'pending' as const,
    stripePayoutsEnabled: account.payouts_enabled === true,
    stripeTransfersEnabled: account.capabilities?.transfers === 'active',
    stripeCountry: account.country ?? null,
    stripeRequirementsDue: [...new Set([...(account.requirements?.currently_due ?? []), ...(account.requirements?.past_due ?? [])])],
    stripeDisabledReason: account.requirements?.disabled_reason ?? null,
    stripeAccountCheckedAt: new Date(),
  };
}
