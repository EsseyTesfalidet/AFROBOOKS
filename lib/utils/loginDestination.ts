export const PAYOUT_SETUP_PATH = '/dashboard?profile=payout';

export function communityReturnPath(requested: string | null): string | null {
  return requested && requested.trim() === requested && /^\/community(?:\/new|\/[a-f0-9]{40}|\?tab=memory)?$/.test(requested) ? requested : null;
}

export function publicReturnPath(requested: string | null): string | null {
  return authorReturnPath(requested) ?? giftReturnPath(requested) ?? communityReturnPath(requested);
}

export function authorReturnPath(requested: string | null): string | null {
  return requested === '/author/start' || requested === '/author/start?view=web' || requested === '/author/start?view=web&studio=video' ? requested : null;
}

export function giftReturnPath(requested: string | null): string | null {
  return requested && (['/gifts', '/gifts/claim'].includes(requested) || /^\/gift\/[A-Za-z0-9_-]{1,128}(?:\?resume=[a-f0-9]{64})?$/.test(requested)) ? requested : null;
}

// Only the known payout destination is accepted from reminder links. Never
// redirect to an arbitrary URL supplied through the login query string.
export function payoutReturnPath(requested: string | null, role: string): string | null {
  return requested === PAYOUT_SETUP_PATH && ['seller', 'both', 'admin'].includes(role)
    ? PAYOUT_SETUP_PATH : null;
}

export function loginDestination(profile: { role: string; activeRole: string }, requested: string | null) {
  return publicReturnPath(requested) ?? payoutReturnPath(requested, profile.role) ??
    (profile.role === 'admin' ? '/admin' : profile.activeRole === 'seller' ? '/dashboard' : '/browse');
}
