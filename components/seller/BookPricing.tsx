'use client';

import { useId, useState } from 'react';
import { calculateFees, calculateCartPricing, MAX_BOOK_PRICE_CENTS, minimumPublicationPrice, priceForSellerEarnings } from '@/lib/utils/fees';
import { pricingGuidance } from '@/lib/utils/pricingGuidance';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function BookPricing({ price, directSaleFee, wordCount = 0, genre = '', audience = 'all', publicationType = 'book', onPriceChange, onValidityChange }: {
  price: number;
  directSaleFee: number;
  wordCount?: number;
  genre?: string;
  audience?: string;
  publicationType?: 'book' | 'magazine' | 'short_story';
  onPriceChange: (price: number) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState<{ field: 'price' | 'earnings'; value: string } | null>(null);
  const [error, setError] = useState('');
  const isStory = publicationType === 'short_story';
  const exampleCount = Math.max(5, Math.ceil(100 / (Math.max(10, price) * 0.95)));
  const storyExample = isStory ? calculateCartPricing(Array(exampleCount).fill(price), directSaleFee) : null;
  const fees = storyExample ?? calculateFees(price, directSaleFee);
  const guidance = pricingGuidance(wordCount, genre, audience, publicationType);

  function choosePrice(value: number) {
    setEditing(null);
    setError('');
    onPriceChange(value);
    onValidityChange(true);
  }

  function change(field: 'price' | 'earnings', value: string) {
    setEditing({ field, value });
    try {
      if (!/^\d{1,6}(?:\.\d{0,2})?$/.test(value)) throw new Error('Enter a USD amount with up to two decimal places.');
      const [dollars, cents = ''] = value.split('.');
      const amount = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
      const retail = field === 'earnings' ? priceForSellerEarnings(amount, directSaleFee) : amount;
      if (retail < minimumPublicationPrice(publicationType) || retail > MAX_BOOK_PRICE_CENTS) throw new Error(`The customer price must be between $${(minimumPublicationPrice(publicationType) / 100).toFixed(2)} and $999,999.99.`);
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
        <h2 id={`${id}-title`} className="font-display text-display-sm text-white">{isStory ? 'Short story pricing' : publicationType === 'magazine' ? 'Issue pricing' : 'Book pricing'}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#aaa]">{isStory ? 'Set a price for one story. Readers can choose several stories and pay once. The example below shows how sharing payment costs affects earnings.' : 'Set a customer price, or enter your desired earnings and we’ll calculate a price that includes AfroBooks’ share and estimated processing.'}</p>
      </div>

      <div className="rounded-2xl border border-[#54441e] bg-[#211c12] p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium text-[#f5b800]">AfroBooks pricing guide</h3>
          <span className="text-sm text-white">{money(guidance.low)}–{money(guidance.high)}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#ccc]">{guidance.basis}</p>
        <p className="mt-2 text-xs leading-relaxed text-[#aaa]">These are starter suggestions. Compare similar titles, consider your audience and adjust with sales experience. You choose the final price, including outside this range.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {([
            { label: 'Lower price', value: guidance.low },
            { label: 'Starting price', value: guidance.suggested },
            { label: 'Higher price', value: guidance.high },
          ]).map(option => (
            <button key={option.label} type="button" onClick={() => choosePrice(option.value)} aria-pressed={price === option.value && !error}
              className="rounded-xl border border-[#66532b] bg-[#17150f] p-3 text-left transition hover:border-[#f5b800] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5b800] aria-pressed:border-[#f5b800]">
              <span className="block text-xs text-[#ccc]">{option.label}</span>
              <span className="mt-1 block text-lg font-medium text-white">{money(option.value)}</span>
              {!isStory && <span className="mt-1 block text-xs text-[#9cddb0]">You earn about {money(calculateFees(option.value, directSaleFee).sellerEarnings)}</span>}
            </button>
          ))}
        </div>
        {(price < guidance.low || price > guidance.high) && <p className="mt-3 text-xs leading-relaxed text-[#ccc]">Your {money(price)} price is outside this guide. You can keep it; consider how it compares with similar books and your earnings goal.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {([
          { field: 'price', label: 'Customer price (USD)', amount: price },
          { field: 'earnings', label: 'Your estimated earnings (USD)', amount: fees.sellerEarnings },
        ] as const).filter(({ field }) => !isStory || field === 'price').map(({ field, label, amount }) => (
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
        <h3 className="mb-4 text-sm font-medium text-white">{isStory ? `Example cart: ${exampleCount} stories at ${money(price)} each` : 'What the price includes'}</h3>
        {storyExample && <p className="mb-4 text-xs leading-relaxed text-[#aaa]">Includes the 5% bundle discount. Author earnings below are the total across these {exampleCount} stories, shared between their authors. Actual earnings depend on the reader’s cart.</p>}
        <dl className="space-y-3 text-sm" aria-live="polite">
          {[
            { label: isStory ? 'Authors’ estimated earnings (total)' : 'Your estimated earnings', value: fees.sellerEarnings, color: 'text-[#4ade80]' },
            { label: `AfroBooks’ share (${directSaleFee}%)`, value: fees.platformFee, color: 'text-[#eee]' },
            { label: 'Estimated payment processing', value: fees.stripeFee, color: 'text-[#eee]' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-[#aaa]">{label}</dt><dd className={`shrink-0 tabular-nums ${color}`}>{money(value)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-[#333] pt-4 text-base font-medium">
            <dt className="text-white">{isStory ? 'Example cart total' : 'Customer price'}</dt><dd className="tabular-nums text-[#f5b800]">{money(storyExample?.total ?? price)}</dd>
          </div>
        </dl>
      </div>
      <p id={`${id}-note`} className="text-xs leading-relaxed text-[#aaa]">
        Estimates use Stripe’s standard US card rate of 2.9% + $0.30. AfroBooks’ {directSaleFee}% share is calculated after processing. Actual fees may vary. Bundle discounts reduce earnings, and books in one payment share the processing cost.
      </p>
    </section>
  );
}
