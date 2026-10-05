# Monthly video creator payouts

The owner chose monthly Stripe transfers and will fund Stripe after Google pays.
No bank debit or top-up is created automatically by AfroBooks.

## Monthly operation

1. Wait for Google's payment for the completed earnings month.
2. Add funds to the platform's Stripe payments balance. The platform and recipient
   must satisfy Stripe's top-up and Connect requirements. Wait until the top-up
   and its balance transaction are available.
3. Open Admin > Videos > Monthly video payouts. Enter the earnings month and the
   Stripe top-up ID (`tu_...`). Confirm that Google has settled and the funding is
   reserved for video creators. The server verifies the live top-up, available
   balance, currency and net amount before granting any budget.
4. The authenticated worker checks every 15 minutes. Admin can also check pending
   payouts or reconcile a specific transfer. Creators see transfer status and their
   payout-account setup link in Video studio.
5. A transfer credits the creator's existing Stripe account. Stripe subsequently
   sends bank payouts on that connected account's schedule.

[Stripe top-up requirements](https://docs.stripe.com/connect/top-ups)

## Accounting and recovery

- Google reports net revenue after fees, taxes and refunds. Creators receive 80%.
- Only completed months are eligible. All prior unpaid fractions roll forward.
- Currency balances remain separate. A USD top-up cannot fund EUR earnings. There
  is no estimated FX conversion; fund the required supported currency or reconcile
  conversion outside this automation before enabling those markets.
- Top-ups can be registered once. Budgets track credited, reserved and transferred
  amounts. Stripe funding is rechecked before a new transfer. Keep registered funds
  available; automatic platform bank payouts or withdrawals can delay payments.
- Google financial confirmation must be less than 24 hours old. Pending or stale
  amounts wait for reconciliation. A buyer's access does not depend on payout funding.
- Account identity, completed onboarding and transfer/payout capability are checked.
- One transfer per creator, currency and funded month. Partial minor units and any
  late adjustments wait for a later funded month. Do not reuse a top-up for another
  month, even if that month's budget has remaining funds.
- Google refunds after payout are deducted from later earnings. The app does not
  silently debit a creator's bank or disguise outstanding refund adjustments.
- Concurrent workers use database reservations and leases. Stripe uses deterministic
  transfer groups and idempotency keys. A lost response is recovered by listing the
  group before retrying. Unknown attempts older than 23 hours require review.
- Manual Stripe reversals are verified by the signed Stripe webhook, flagged for
  video balance review and excluded from unrelated book royalty calculations.
  Returned funds are not automatically counted as newly spendable video funding.
- Verified transfer receipts prevent the legacy book royalty checker from treating
  video transfers as unexplained book payouts. This also requires the updated
  `processMonthlyPayouts` Firebase function.
- There is no button that marks money paid without a matching Stripe transfer.

All funding, budgets, receipts, earnings and payout records are server-only.
Creator responses omit raw purchase tokens and Stripe account credentials.
Admin registration records a financial authorization in `watchAudit`.

## Deployment and limits

The worker endpoint is `/api/watch/jobs`. It accepts only a verified Google identity
token for `GOOGLE_PLAY_JOBS_AUDIENCE=https://afrobs.com/api/watch/jobs` and the configured
notification service account. Cloud Scheduler calls it every 15 minutes in UTC.
To stop automatic runs, pause the `afrobooks-video-payments` Cloud Scheduler job.
Submitted Stripe transfers are unaffected by pausing the job.

The initial bounded sweep reconciles five purchases and checks up to five creators
per run. Funded month/currency budgets keep cursors; unresolved individual accounts
cannot permanently block other creators. The newest 12 funded month/currency
budgets are processed. Creator histories above 1,000 earnings or payout records
require pagination work before automation can continue. Monitor and increase worker
capacity as sales grow, particularly to keep Google acknowledgements timely.

Stripe country eligibility, available currencies, fees, bank verification and
funding arrival are controlled by Stripe. Tests simulate provider transfers;
no real creator transfer or bank payout was made during implementation. There
were no video creators, sales or registered top-ups at the last production check.

## Production verification — October 4, 2026

Website deployment `dpl_5663N9NPRbjMyEXUpv292o3vaWeK` is live. The updated
`processMonthlyPayouts` Firebase function was deployed successfully. The descending
document-ID index for `watchPayoutBudgets` is READY and is included in
`firestore.indexes.json` (the emulator does not enforce production index coverage).

Cloud Scheduler job `afrobooks-video-payments` is ENABLED for every 15 minutes.
Its authenticated production run at 11:21:47 UTC returned HTTP 200 and recorded
zero purchases checked, zero failures and a released lease. Unauthenticated
requests returned HTTP 401. No payout budgets existed, so no Stripe transfer was
attempted. One creator application now exists; no application was approved by
this deployment. Native Play version 3 remains blocked by testing-release permission.
