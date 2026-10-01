# Book refund synchronization

Confirmed full Stripe refunds mark every order in that payment `refunded`.
Admin revenue excludes these orders, while order history and receipts remain
available. The receipt says **Purchase refunded** instead of confirming a sale.
Admin CSV exports count earnings only for completed orders.

The webhook processes `charge.refunded`, `refund.created`, `refund.updated`, and
`refund.failed`. It retrieves current Stripe payment and refund records, paginates
all refunds, and sums only successful amounts. It does not trust the arrival order
of event payloads. Stripe reads occur inside the Firestore transaction so a
conflicting retry rechecks current provider state. A failed synchronization returns
HTTP 500 for Stripe retry.

Library removal, order status, fulfillment markers and matching checkout-lock
removal commit together. Only a purchased entry linked to the refunded order is
removed. Free copies and entries linked to independent orders are preserved. If
another completed ordinary purchase exists, it replaces the refunded order's
library reference. Gifts lose only the refunded gift's entitlement. Reading
progress and order history are retained. Delayed success events and library
recovery cannot restore an order marked refunded.

Partial and pending refunds preserve existing access and put orders under review.
A partial refund of a multi-title payment does not identify the affected title,
so the app does not guess. These orders are excluded from completed-order revenue
until reconciled; this is not a final allocation of the partial refund. A failed
refund leaves an otherwise completed sale intact. If a previously confirmed full
refund later fails, the order returns to review without automatically granting
access or charging again.

Refunds initially hold author payouts for financial review. A narrow automatic
reconciliation clears a `payment_review` hold when Stripe confirms full refunds,
the author's account is ready and belongs to that author, and neither payout
reservations nor any Stripe transfers exist for that author. Other completed
payments are also checked for refunds/disputes; balances must exactly match the
ledger before or after removing known unpaid refund credits. Resolved orders get
a server-owned settlement marker so retries and the royalty worker do not reapply
the hold. Checkout also attempts this reconciliation for an existing review hold.

Partial refunds, disputes, reserved/transferred royalties, account mismatches,
unexplained balances and other hold reasons stay under review. This synchronization
does not issue refunds, reverse transfers, or claim transferred royalties have
been recovered. Historical sales counters are retained; admin order-based revenue
reflects changed order statuses. Checkout identifies an internal payment review
separately from incomplete Stripe onboarding.

Regression coverage includes duplicate events, delayed fulfillment, full and
partial bundles, pending/failed refunds, gift copies, independent ownership,
repurchasing after a full refund, provider failures, and refund totals across
multiple records. Browser coverage verifies that a server entitlement removal
updates the ownership control without a reload.

## October 1, 2026 verification

- 61 unit tests and 112 database/rules integration tests passed, including ten
  new refund regressions. TypeScript and the ownership browser test passed.
- The live Stripe endpoint already subscribes to all four required refund events.
- Two existing payments were verified as fully refunded in Stripe. Their two app
  orders were synchronized and checked for stale purchased library entries.
  A private pre-change journal was retained. No refund or transfer was created.
- Commit `bffdf39` was deployed to `https://afrobs.com` as
  `dpl_DML1GeSPtjwMqoViK6goMMs2rJWC`. Live payment/library authorization checks
  passed. An existing Stripe `charge.refunded` event was replayed and returned
  HTTP 200 at 04:36 UTC on this deployment.
