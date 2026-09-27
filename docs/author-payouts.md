# Author royalties and bank payouts

Authors connect an Express account from **Seller profile → Payouts**. Stripe hosts identity and bank collection and offers the countries available to the platform. Account readiness is retrieved from Stripe, including the transfers capability and payout eligibility; a successful redirect alone does not activate an author. Paid checkout requires every author in the cart to be ready. Banking information stays with Stripe.

After a live payment is fulfilled, each order's recorded author earnings are reserved in a Firestore transaction and transferred to the connected account with the original charge as `source_transaction`. The platform retains the remainder. Stripe controls settlement, currency conversion and the connected account's bank payout schedule. A confirmed transfer is labelled **Transferred to Stripe**, not paid to the author's bank. The author's profile separately retrieves actual Stripe balances and recent bank payouts, including failures.

`processMonthlyPayouts` retains its deployed Firebase function name but runs hourly. It retries interrupted book royalty processing; borrowing payouts remain separate. Both webhook and scheduled processing respect `platformSettings/global.automatedPayoutsEnabled`.

Before reserving earnings, reconciliation compares all completed orders, reserved/confirmed payouts, seller balances and Stripe transfers. Each order uses one deterministic payout document and Stripe idempotency key. A lease limits concurrent requests. If a response was lost, the existing transfer is recovered. An unknown attempt older than 23 hours is held for review instead of reusing a possibly expired Stripe idempotency key. Reserved money is never silently credited back after an ambiguous failure.

## Operations

- The Firebase function binds the live `STRIPE_SECRET_KEY` in Google Secret Manager. Vercel separately needs the matching live Stripe secret, publishable key, webhook signing secret and `NEXT_PUBLIC_APP_URL=https://afrobs.com`.
- In Stripe Connect onboarding options, enable the eligible countries you serve and request transfers for each. Account creation deliberately omits country and capabilities so hosted onboarding can offer that configured selection. Stripe's platform and cross-border eligibility still apply; an unrestricted worldwide list is not promised.
- The live platform webhook is `https://afrobs.com/api/stripe/webhook`. Subscribe to `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated` and `transfer.reversed` as well as any existing subscription events.
- Refunds, disputes, reversed transfers, inconsistent balances and unknown historical payouts place the author on hold and create a private `payoutReviews` record. Admin payouts lists these exceptions. This is a manual financial review workflow: the system does not automatically recover an already transferred royalty or debit an author's bank.
- To resolve a hold, staff must inspect the original payment, Stripe transfer and Firestore ledger, complete any required refund/reversal through Stripe, and reconcile the financial records before clearing `payoutHoldReason` and closing the review. Clearing a flag alone does not repair a ledger. Do not retry an ambiguous old transfer without checking Stripe.
- Pause automated transfers by setting `automatedPayoutsEnabled=false` through trusted administration. Already submitted Stripe transfers and bank payouts are unaffected. Monitor function errors and open reviews.
- Reconciliation currently scans an author's history. Revisit batching and incremental reconciliation as transaction volume grows.

## Validation

Automated checks use synthetic Stripe gateways and the Firebase emulators, covering concurrent fulfillment, duplicate transfer protection, response-loss recovery, expired attempts, ineligible accounts, refund/dispute holds, balance mismatch and private review access. Browser checks cover setup, verified status, Stripe navigation, currency amounts, bank failures, pause/review messages, error recovery and mobile layout. No live charge or transfer is created by these checks. A real author must complete Stripe onboarding before bank payout delivery can be verified end to end.
