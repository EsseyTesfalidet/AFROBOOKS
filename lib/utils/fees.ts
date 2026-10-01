export const DEFAULT_PLATFORM_FEE_PERCENT = 15;
export const MIN_BOOK_PRICE_CENTS = 50;
export const MAX_BOOK_PRICE_CENTS = 99_999_999;

export function minimumPublicationPrice(type?: string) { return type === 'short_story' ? 10 : MIN_BOOK_PRICE_CENTS; }

// Low-priced titles share one payment. Apply the minimum to the discounted
// total, never add a fee or silently charge more than the cart's actual price.
export function cartMinimum(prices: number[]) {
  const minimum = prices.some(price => price > 0 && price < 50) ? 100 : 50;
  const { total } = calculateCartTotals(prices);
  return { minimum, remaining: Math.max(0, minimum - total) };
}

// Estimate for a standard US domestic card payment. Stripe's actual charge can
// vary by payment method, country and account pricing.
export function calculateFees(amountCents: number, directSaleFee = DEFAULT_PLATFORM_FEE_PERCENT): {
  stripeFee: number;
  platformFee: number;
  sellerEarnings: number;
} {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 || !Number.isFinite(directSaleFee) || directSaleFee < 0 || directSaleFee > 100) throw new Error('Invalid fee configuration');
  const stripeFee = Math.min(amountCents, Math.round(amountCents * 0.029) + 30);
  const afterStripe = amountCents - stripeFee;
  const platformFee = Math.round(afterStripe * directSaleFee / 100);
  const sellerEarnings = afterStripe - platformFee;
  return { stripeFee, platformFee, sellerEarnings };
}

/** Smallest retail price that covers the requested author earnings and fees. */
export function priceForSellerEarnings(targetCents: number, directSaleFee = DEFAULT_PLATFORM_FEE_PERCENT): number {
  calculateFees(0, directSaleFee);
  if (!Number.isSafeInteger(targetCents) || targetCents <= 0 || directSaleFee === 100 ||
      calculateFees(MAX_BOOK_PRICE_CENTS, directSaleFee).sellerEarnings < targetCents) {
    throw new Error('These author earnings cannot be covered by a valid book price.');
  }
  let low = MIN_BOOK_PRICE_CENTS;
  let high = MAX_BOOK_PRICE_CENTS;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (calculateFees(mid, directSaleFee).sellerEarnings >= targetCents) high = mid;
    else low = mid + 1;
  }
  return low;
}

/** Allocate cents proportionally, with stable largest-remainder rounding. */
function allocateCents(amounts: number[], total: number): number[] {
  const subtotal = amounts.reduce((sum, amount) => sum + amount, 0);
  if (subtotal === 0 || total === 0) return amounts.map(() => 0);
  // Integer arithmetic keeps even large carts and equal shares deterministic.
  const denominator = BigInt(subtotal);
  const products = amounts.map(amount => BigInt(amount) * BigInt(total));
  const shares = products.map(product => Number(product / denominator));
  const ranked = products.map((product, index) => ({ index, remainder: product % denominator }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  const remaining = total - shares.reduce((sum, amount) => sum + amount, 0);
  for (let index = 0; index < remaining; index++) shares[ranked[index].index] += 1;
  return shares;
}

export function calculateCartTotals(prices: number[]) {
  const subtotal = prices.reduce((sum, price) => sum + price, 0);
  if (prices.some(price => !Number.isSafeInteger(price) || price < 0 || price > MAX_BOOK_PRICE_CENTS) || !Number.isSafeInteger(subtotal)) {
    throw new Error('Invalid book price');
  }
  const bundleDiscount = prices.length >= 3 ? Math.round(subtotal * 0.05) : 0;
  return { subtotal, bundleDiscount, total: subtotal - bundleDiscount };
}

/** One customer payment, one processing fee, allocated across its book orders. */
export function calculateCartPricing(prices: number[], directSaleFee = DEFAULT_PLATFORM_FEE_PERCENT) {
  const totals = calculateCartTotals(prices);
  const discounts = allocateCents(prices, totals.bundleDiscount);
  const finalPrices = prices.map((price, index) => price - discounts[index]);
  const fees = calculateFees(totals.total, directSaleFee);
  const processingShares = allocateCents(finalPrices, fees.stripeFee);
  const netPrices = finalPrices.map((price, index) => price - processingShares[index]);
  const platformShares = allocateCents(netPrices, fees.platformFee);
  return {
    ...totals,
    ...fees,
    lines: prices.map((price, index) => ({
      originalPrice: price,
      discountAmount: discounts[index],
      finalPrice: finalPrices[index],
      stripeFee: processingShares[index],
      platformFee: platformShares[index],
      sellerEarnings: netPrices[index] - platformShares[index],
    })),
  };
}
