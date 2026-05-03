export function calculateEarnings(priceCents: number): {
  stripeFee: number;
  platformFee: number;
  sellerEarnings: number;
  stripeFeeDisplay: string;
  platformFeeDisplay: string;
  sellerEarningsDisplay: string;
} {
  const stripeFee = Math.round(priceCents * 0.029) + 30;
  const afterStripe = priceCents - stripeFee;
  const platformFee = Math.round(afterStripe * 0.15);
  const sellerEarnings = afterStripe - platformFee;

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  return {
    stripeFee,
    platformFee,
    sellerEarnings,
    stripeFeeDisplay: fmt(stripeFee),
    platformFeeDisplay: fmt(platformFee),
    sellerEarningsDisplay: fmt(sellerEarnings),
  };
}
