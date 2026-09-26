export function paymentConfiguration(env: Record<string, string | undefined>) {
  const secretMode = /^(?:sk|rk)_(live|test)_/.exec(env.STRIPE_SECRET_KEY ?? '')?.[1];
  const publicMode = /^pk_(live|test)_/.exec(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')?.[1];
  const keysReady = !!secretMode && secretMode === publicMode && (env.VERCEL_ENV !== 'production' || secretMode === 'live');
  return { keysReady, checkoutReady: keysReady && !!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') };
}
