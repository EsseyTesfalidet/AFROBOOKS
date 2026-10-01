# Author-controlled pricing guidance

The Pricing step in Publish suggests a range while the author keeps the final choice. Editing an existing book preserves its price. Choosing a suggestion changes the draft only; publishing/saving remains explicit. Prices outside the suggested range are allowed within the existing checkout limits. No paid AI or external pricing service is used.

The first version uses editorial starting ranges, not observed market prices or sales forecasts. Manuscript word count informs ordinary prose suggestions; poetry and children's titles use a general range because word count alone poorly represents their value. Authors should compare similar titles and assess sales after launch.

| Manuscript | Range | Starting price |
| --- | --- | --- |
| Under 10,000 words | $0.99–$2.99 | $1.99 |
| 10,000–39,999 words | $2.99–$5.99 | $3.99 |
| 40,000 words or more | $4.99–$9.99 | $6.99 |
| Poetry, children's titles, or unknown length | $2.99–$7.99 | $4.99 |

Ranges are defined in `lib/utils/pricingGuidance.ts`. Each suggestion displays estimated author earnings using the current platform commission and the same fee calculation as checkout. Authors can also enter a custom customer price or desired net earnings. Existing bundle-discount and estimated processing-fee behavior is unchanged.

Validation: unit coverage checks range boundaries and checkout/fee compatibility. Browser checks confirm existing-price preservation, suggestion selection, custom prices outside the guide, invalid amount rejection, recovery from invalid input, target earnings and layouts at 320, 390, 844 and 1280 pixels. The combined production build passed.

## Existing price and accounting rules

`books.price` is the full retail price in USD cents. The earnings calculator finds the lowest valid retail price that covers the author's target, configured commission and estimated card processing. The default commission is 15% of proceeds after estimated processing, using `platformSettings/global.directSaleFee`. This is AfroBooks revenue before other business costs, not a guarantee of net profit.

Processing is estimated at [Stripe's published US domestic card rate](https://stripe.com/pricing) of 2.9% + $0.30. Other payment methods, international cards, currency conversion, Connect costs and custom account pricing can differ. The ledger reserves this estimate; it does not reconcile the actual Stripe balance transaction fee. Royalty routing is described in [author payouts](author-payouts.md) and [destination charges](destination-charges.md).

For a single undiscounted payment at the default commission:

| Included in customer price | Amount |
| --- | ---: |
| Author earnings | $5.00 |
| AfroBooks share | $0.88 |
| Estimated processing | $0.48 |
| Customer price | $6.36 |

Carts with three or more books apply the existing 5% bundle discount first. Each PaymentIntent has one processing estimate, including one fixed $0.30 charge. Discounts and fees are allocated proportionally across orders using integer arithmetic and stable largest-remainder rounding. Author earnings are the remainder, so every order and the whole payment balance to the cent. Discounts can lower the earnings shown in the single-book estimate.

Cart and server share the totals calculation. Checkout reads prices and commission from the database; orders record the applied commission, estimate basis and pricing version. Buyer screens display the full retail price with processing and platform fees included. Existing tests cover earnings targets, commissions, invalid inputs, uneven allocations, zero-price lines, large amounts, shared processing costs and duplicate fulfillment across multiple authors.
