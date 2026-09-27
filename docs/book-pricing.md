# Book pricing

`books.price` is the full retail price in USD cents. Authors can set that price directly or enter desired earnings in the publishing form. The earnings calculator finds the lowest valid retail price that covers those earnings, the configured commission, and estimated card processing. Existing listings keep their retail prices until an author changes them.

The default commission is 15% of proceeds after estimated processing, using the existing `platformSettings/global.directSaleFee` setting. This is AfroBooks revenue before other business costs, not a guarantee of net profit. There is no universal commission or retail price for ebooks.

The processing estimate uses [Stripe's published US domestic card rate](https://stripe.com/pricing) of 2.9% + $0.30. Other payment methods, international cards, currency conversion, Connect costs and custom account pricing can differ. The ledger currently reserves this estimate; it does not reconcile the actual Stripe balance transaction fee. Author royalties use the reconciled, source-linked transfer flow described in [author payouts](author-payouts.md).

For a single undiscounted payment at the default commission:

| Included in customer price | Amount |
| --- | ---: |
| Author earnings | $5.00 |
| AfroBooks share | $0.88 |
| Estimated processing | $0.48 |
| Customer price | $6.36 |

For carts with three or more books, the existing 5% bundle discount is applied first. One PaymentIntent has one processing estimate, including one fixed $0.30 charge. Discounts and fees are allocated proportionally across book orders using integer arithmetic and stable largest-remainder rounding. Author earnings are the remainder, so every line and the complete payment balance exactly to the cent. Discounts can lower the earnings shown in the single-book estimate.

The cart and server share the same totals calculation. Checkout reads prices and commission from the database. Orders record the applied commission, estimate basis and pricing version for later review. Buyer screens display the complete retail price and identify processing and platform fees as included.

Validation covers earnings targets, configured commissions, invalid input, uneven allocations, zero-price lines, large amounts, single-payment fee allocation, buyer/server totals, and duplicate webhook fulfillment across multiple authors. Browser checks exercise the actual pricing component and cart store at desktop and mobile sizes. No live charges or transfers are needed for these checks.
