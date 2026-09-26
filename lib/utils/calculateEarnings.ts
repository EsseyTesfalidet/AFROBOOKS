import { calculateFees } from './fees';

export function calculateEarnings(priceCents: number, directSaleFee = 15): {
  stripeFee: number;
  platformFee: number;
  sellerEarnings: number;
  stripeFeeDisplay: string;
  platformFeeDisplay: string;
  sellerEarningsDisplay: string;
} {
  const { stripeFee, platformFee, sellerEarnings } = calculateFees(priceCents, directSaleFee);

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
