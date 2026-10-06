export const MUSIC_PRODUCT = 'afrobooks_music_monthly';
export const MUSIC_BASE_PLAN = 'monthly';
export const MUSIC_USD_PRICE = '2.99';
export function musicActive(state: string, expiresAt: number, now = Date.now()) {
  return ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(state) && expiresAt > now;
}
// Integer allocation conserves the complete creator pool; deterministic rounding.
export function musicShares(pool: bigint, listeners: { creatorId: string; seconds: number }[]) {
  const eligible = listeners.filter(row => Number.isSafeInteger(row.seconds) && row.seconds >= 30).sort((a, b) => a.creatorId.localeCompare(b.creatorId));
  const total = eligible.reduce((sum, row) => sum + BigInt(row.seconds), BigInt(0));
  if (pool < BigInt(0) || !total) return [];
  let left = pool;
  return eligible.map((row, i) => { const amount = i === eligible.length - 1 ? left : pool * BigInt(row.seconds) / total; left -= amount; return { creatorId: row.creatorId, amount: amount.toString() }; });
}
