# Book promotions

Authors can submit published books at `/promotions`; administrators review campaigns and edit the offer at `/admin/promotions`. Discover has one clearly labeled **Sponsored · Author promotion** placement. Readers never see advertisements in the reader. The children’s section is outside this release.

## Launch offer

Start with a **free seven-day pilot**. There is no automatic renewal, traffic guarantee, or charge during the pilot. The offer defaults to enabled at $0 when `promotionSettings/global` does not exist. Admin can pause new submissions/checkouts or set a one-time USD price from $1–$1,000. Existing requests keep the price accepted at submission. Already activated campaigns continue if new submissions are paused.

Before charging, use pilot results to choose a reasonable price. This release does not invent audience estimates or claim a particular return on advertising spend.

## Approval and payment

1. The author selects a live book with a cover and accepts the current terms. A Firestore transaction locks one open campaign per book and snapshots the price.
2. Admin reviews the book. Free campaigns start on approval; paid campaigns become eligible for Stripe Checkout. Declined requests are never charged.
3. A verified Checkout webhook checks ownership, immutable payment references, amount, currency, mode, live book eligibility, and the active campaign reservation before starting seven days of delivery. A browser return alone never activates a campaign.
4. Ads rotate randomly among eligible campaigns. Current book data supplies the title and cover. Edited creative fields require a new request; removed, flagged, suspended-author, or tombstoned books never qualify. Expiry is checked by server time and client timers.

Checkout sessions use one stable idempotency key per campaign and expire after 23 hours. A lost creation response can be recovered without making a second session. Ambiguous older attempts stay blocked for review. An expired checkout requires a new request.

Ad payments do not create book orders, library entitlements, or author royalties. The platform receives the promotion payment; Stripe processing fees reduce net revenue. Promotion records and Stripe payment links are in the campaign manager; existing book revenue reports continue to describe book sales only.

## Stopping, deletion and refunds

Authors and admins can stop a campaign. Paid campaigns and checkouts already in progress move to **Payment review**. Admin’s **Resolve payment / full refund** closes an unpaid session or refunds the remaining charge in full, after confirmation. Refund retry recovery checks Stripe’s existing refund state. Disputes and ambiguous/multiple checkouts require reconciliation in the Stripe dashboard.

Book deletion stops matching campaigns before file cleanup. A payment received after deletion or cancellation stays in payment review and cannot resurrect the book. Financial campaign records retain identifiers and amounts, not a copied book title, cover, description, or manuscript.

Refund/dispute events suppress the ad. A refund arriving before checkout completion cannot reactivate it. Failed or pending refunds stay in payment review, including a refund that initially succeeded and later failed. This follows [Stripe’s asynchronous refund behavior](https://docs.stripe.com/testing). Administrators must monitor this queue; automatic refund eligibility decisions and prorating are not implemented.

## Reporting and privacy

Views require at least 50% of the placement visible for one second in a visible tab. Clicks count a view too. Metrics count each signed-in account once per UTC day per campaign; authors’ own visits are excluded. Anonymous visitors can see promotions but are not measured. These are approximate daily reader counts, not unique campaign reach, audited impressions, sales attribution, or a billing basis.

Events contain a hash of campaign/day/account and the date, without IP addresses or ad cookies. Counters and event markers are private server writes. No ad network or cross-site targeting is used. Event-marker retention is currently the lifetime of the campaign; add a scheduled retention cleanup before large-scale rollout. Private financial records are retained for reconciliation.

## Operations and verification

Deploy Firestore rules and the `bookPromotions(sellerId ASC, createdAt DESC)` index before the web release. `scripts/promotion-readiness-check.cjs` can run in a production build to check live Stripe keys, charge eligibility, and required webhook subscriptions without logging secrets or making a payment.

Validation passed: 25 unit tests, 45 Firebase integration tests, TypeScript, targeted lint (no errors; two existing-pattern React Compiler migration warnings), and a production build. Coverage includes role boundaries, ownership, quote changes, concurrent submissions, deduplication, wrong amount/mode, webhook replay and ordering, expiry, deletion, and checkout/refund response loss. Headless browser fixtures cover submission, failed-save recovery, approval, offer settings, refund confirmation, covers, metrics visibility, deletion and mobile layouts. One emulator run hit a transient transaction error in the existing payout test; the complete final run passed. No real card was charged during verification.

For higher traffic, add cached placement inventory with invalidation, sharded counters, campaign/audit exports, retention cleanup, and conversion attribution. Public selection currently queries eligible active campaigns; campaign management uses server cursor pagination in batches of 25.
