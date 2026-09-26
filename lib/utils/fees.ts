export function calculateFees(amountCents: number, directSaleFee = 15): {
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
