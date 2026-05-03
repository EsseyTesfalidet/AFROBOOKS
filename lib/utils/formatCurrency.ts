export function formatCurrency(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
