// Stripe API minor units differ from ISO decimals for ISK and UGX. Both keep
// the two-decimal API representation. See https://docs.stripe.com/currencies.
const zeroDecimal = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
export function formatStripeAmount(amount: number, currency = 'usd') {
  const code = currency.toUpperCase();
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount / (zeroDecimal.has(code) ? 1 : 100));
}
