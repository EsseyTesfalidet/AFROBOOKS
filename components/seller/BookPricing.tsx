'use client';

import { useId, useState } from 'react';
import { calculateFees, MAX_BOOK_PRICE_CENTS, MIN_BOOK_PRICE_CENTS, priceForSellerEarnings } from '@/lib/utils/fees';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function BookPricing({ price, directSaleFee, onPriceChange, onValidityChange }: {
  price: number;
  directSaleFee: number;
  onPriceChange: (price: number) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState<{ field: 'price' | 'earnings'; value: string } | null>(null);
  const [error, setError] = useState('');
  const fees = calculateFees(price, directSaleFee);

  function change(field: 'price' | 'earnings', value: string) {
    setEditing({ field, value });
    try {
      if (!/^\d{1,6}(?:\.\d{0,2})?$/.test(value)) throw new Error('Enter a USD amount with up to two decimal places.');
      const [dollars, cents = ''] = value.split('.');
      const amount = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
      const retail = field === 'earnings' ? priceForSellerEarnings(amount, directSaleFee) : amount;
      if (retail < MIN_BOOK_PRICE_CENTS || retail > MAX_BOOK_PRICE_CENTS) throw new Error('The customer price must be between $0.50 and $999,999.99.');
      onPriceChange(retail);
      onValidityChange(true);
      setError('');
    } catch (cause) {
      onValidityChange(false);
      setError(cause instanceof Error ? cause.message : 'Enter a valid price.');
    }
  }

  return (
    <section className="space-y-5" aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className="font-display text-display-sm text-white">Book pricing</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#aaa]">Set a customer price, or enter your desired earnings and we’ll calculate a price that includes AfroBooks’ share and estimated processing.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {([
          { field: 'price', label: 'Customer price (USD)', amount: price },
          { field: 'earnings', label: 'Your estimated earnings (USD)', amount: fees.sellerEarnings },
        ] as const).map(({ field, label, amount }) => (
          <div key={field}>
            <label htmlFor={`${id}-${field}`} className="mb-2 block text-sm text-[#ddd]">{label}</label>
            <input
              id={`${id}-${field}`} type="text" inputMode="decimal" autoComplete="off"
              disabled={field === 'earnings' && directSaleFee === 100}
              value={editing?.field === field ? editing.value : (amount / 100).toFixed(2)}
              onChange={event => change(field, event.target.value)}
              onBlur={() => { if (!error) setEditing(null); }}
              aria-invalid={!!error && editing?.field === field}
              aria-describedby={error ? `${id}-error` : `${id}-note`}
              className="min-h-12 w-full rounded-xl border border-[#444] bg-[#151515] px-4 text-lg text-white outline-none focus:border-[#f5b800] focus:ring-1 focus:ring-[#f5b800] disabled:opacity-50"
            />
          </div>
        ))}
      </div>
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-red-300">{error}</p>}
      {directSaleFee === 100 && <p className="text-sm text-amber-200">The current platform commission leaves no author earnings. Contact support before publishing.</p>}

      <div className="rounded-xl border border-[#2a2a2a] bg-[#171717] p-5">
        <h3 className="mb-4 text-sm font-medium text-white">What the price includes</h3>
        <dl className="space-y-3 text-sm" aria-live="polite">
          {[
            { label: 'Your estimated earnings', value: fees.sellerEarnings, color: 'text-[#4ade80]' },
            { label: `AfroBooks’ share (${directSaleFee}%)`, value: fees.platformFee, color: 'text-[#eee]' },
            { label: 'Estimated payment processing', value: fees.stripeFee, color: 'text-[#eee]' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-[#aaa]">{label}</dt><dd className={`shrink-0 tabular-nums ${color}`}>{money(value)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-[#333] pt-4 text-base font-medium">
            <dt className="text-white">Customer price</dt><dd className="tabular-nums text-[#f5b800]">{money(price)}</dd>
          </div>
        </dl>
      </div>
      <p id={`${id}-note`} className="text-xs leading-relaxed text-[#aaa]">
        Estimates use Stripe’s standard US card rate of 2.9% + $0.30. AfroBooks’ {directSaleFee}% share is calculated after processing. Actual fees may vary. Bundle discounts reduce earnings, and books in one payment share the processing cost.
      </p>
    </section>
  );
}
