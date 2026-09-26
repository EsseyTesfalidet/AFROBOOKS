# Feature audit — 26 September 2026

Reviewed app commit `ca93ffd` and its Vercel production deployment. This is an assessment, not a removal or repair release.

The subsequent fixes and intentionally paused features are tracked in [the repair release](repair-release-2026-09-26.md). Findings below describe the original audited version.

## Recommendation

Keep the core path: discover a book → read a preview → buy → open the library → continue reading. Keep author publishing/editing, account access, basic sales reporting, and essential moderation. Fix those paths before expanding the product.

Hide unfinished extras from navigation until they have a complete implementation. Hiding subscriptions or a publishing option must also disable its server entry point; existing purchases, balances, and billing obligations must be preserved.

| Feature | Recommended decision | Why |
| --- | --- | --- |
| Three subscription plans | Pause new sales | No live subscription titles; advertised tiers, cancellation, reporting, and reading royalties are incomplete. |
| Referral program / credits | Hide for now | Codes and balances are displayed, but no referral redemption or reward flow exists. |
| Co-author revenue percentages | Remove the financial controls for now | Percentages are saved but never used to distribute money. Author credits could remain. |
| Preorders | Pause until release gating works | A purchaser can read uploaded paid chapters before the release date. |
| Global swipe-to-change-page navigation | Remove | It conflicts with horizontal book shelves; bottom navigation already exists. Keep reader chapter gestures. |
| Profile reader settings | Consolidate with actual reader settings | Two independent settings stores currently disagree. |
| Reading-activity sharing / weekly digest / unsupported notification switches | Hide unsupported controls | Some only change local state; others have no corresponding delivery job. |
| Separate sample reader and duplicate profile implementations | Consolidate gradually | Shared components would reduce inconsistent behavior. Preserve public URLs with redirects where appropriate. |

These are product recommendations based on the current implementation and catalog, not usage analytics. I did not measure customer demand for these features.

## Fix first

### F01 — A purchasable book has no reader chapters

**Confirmed in production, read-only.** `Marriage's Deep Recesses: Rebirthing Trust` (`xhB6Sy1TEAkbqW7kmeWY`) is live, costs $4.99, is not a preorder, and declares 16 chapters. Its actual chapter collection contains zero documents. This explains why opening this title cannot display text even after the reader-loading fixes.

Temporarily stop new sales of this listing, recover/import its chapter content, and validate it before relisting. Do not delete any existing order or ownership records. The publishing flow creates the public book document before uploads and sequential chapter writes finish; failure can leave an incomplete listing. Publish as a draft first, then make it live only after content validation. The current data alone does not establish how this particular book lost or failed to receive its chapters.

Evidence: `app/(seller)/publish/page.tsx:203`, `:257`, `:265`; `app/api/stripe/create-payment-intent/route.ts:63`.

### F02 — Public book records contain manuscript download links

**Confirmed metadata exposure in production; files were not downloaded.** Two live book records contain token-bearing manuscript download URLs. Live book records are publicly readable. Raw manuscript links should not be included in the public catalog document, even when the Storage path has owner/admin rules.

Move archive references to private records, store object paths instead of public download URLs, and revoke previously exposed download tokens where applicable. Preserve the uploaded manuscript files. Verify access anonymously after the change.

Evidence: `lib/firebase/storage.ts:10`, `app/(seller)/publish/page.tsx:257`, `firestore.rules:62`.

### F03 — Publishing approval can be bypassed

**Reproduced in the local rules emulator.** A seller can directly create a live book marked as copyright-approved without passing through admin approval. The client calculates approval status, while the rules permit the resulting write without enforcing that approval policy.

Keep moderation. Move publishing approval and protected status transitions to the server, and restrict seller writes to allowed draft/content fields. The existing UI's verification and copyright checks are not sufficient enforcement.

Evidence: `firestore.rules:65`, `app/(seller)/publish/page.tsx:195`.

### F04 — Payout handling needs a financial correctness pass

**Confirmed in source.** The monthly payout code creates a fresh payout record, transfers funds without an idempotency key, then sets the seller's pending balance to zero. A failure after the transfer can lead to another transfer on retry; sales arriving during the transfer can be erased from the pending balance. The admin “Mark Paid” action changes database status and sends a “money sent” notification without performing or verifying a transfer.

The production project lists `processMonthlyPayouts` and `processMonthlyBorrowPayouts` as ACTIVE functions. I did not execute either function, verify their deployed source matches this checkout, or inspect actual transfers.

Keep payouts, but introduce reserved payout amounts, durable transfer IDs, idempotency keys, and reconciliation. Distinguish manually recorded payments from verified transfers. Borrow payouts also lack a processed-period guard.

Evidence: `functions/src/stripe/processPayouts.ts:35`, `:46`, `:55`; `functions/src/subscriptions/processBorrows.ts:43`; `app/(admin)/admin/payouts/page.tsx:32`.

## Repair core features

### F05 — “Edit book” opens the new-book form

**Confirmed in source.** Listings link to `/publish?edit=<id>`, but the publish page never reads that parameter or loads the existing book. Submission always calls `addDoc`. Saving through that path creates another book instead of editing the original; saved drafts lack a working resume/edit flow.

Implement an explicit edit mode that loads book and chapter data, updates the same ID, and enforces ownership. Test changing a title and chapter without creating a duplicate listing.

Evidence: `app/(seller)/listings/page.tsx:251`; `app/(seller)/publish/page.tsx:46`, `:203`.

### F06 — Four more Firestore queries fail because indexes are missing

**Reproduced against production using a nonexistent audit user ID; no personal records were read.** These queries returned `FAILED_PRECONDITION`:

| Feature | Required composite fields |
| --- | --- |
| Continue Reading / resume bar | `readingProgress: userId ASC, isFinished ASC, lastReadAt DESC` |
| Recently finished books | `readingProgress: userId ASC, isFinished ASC, finishedAt DESC` |
| My Reviews | `reviews: reviewerId ASC, createdAt DESC` |
| Seller profile page verification lookup | `verificationRequests: sellerId ASC, submittedAt DESC` |

Add the indexes and error states. Some callers currently fail silently or leave loading indicators running. The review and preview indexes fixed in the previous release are separate and were not the ones failing here.

Evidence: `lib/firebase/firestore.ts:89`, `:101`; `components/buyer/BuyerProfileDrawer.tsx:134`; `app/(seller)/seller/profile/[section]/page.tsx:115`.

### F07 — Subscriptions are not ready to sell

**Production catalog check:** five live books, zero marked for subscription. The plans nevertheless advertise 500+, 2,000+, and all ebooks.

**Live browser check:** a guest can open a subscription payment modal, but submitting it leaves the modal unchanged, with no sign-in prompt or error and no subscription request.

**Local emulator check:** an active Basic subscriber can read a book marked premium-only. Access checks use active status and `inSubscription`, ignoring the selected tier and availability date.

**Source checks:** no subscription cancellation/customer-portal flow was found, despite “Cancel anytime” and the terms' promise of cancellation from profile settings. Account deletion removes local subscription records without cancelling Stripe billing. The webhook updates user subscription fields but does not populate the `subscriptions` collection read by the admin dashboard. No app path creates the `borrowRecords` consumed by the subscription-earnings function. Subscription creation also lacks a duplicate-active-subscription guard; the fallback price construction casts an incompatible inline product shape to `any` instead of using the installed SDK's required product ID.

Pause new subscription sales until catalog eligibility, tier enforcement, signup/login, cancellation, renewal state, reporting, and royalty tracking work together. Keep existing subscribers' access and provide a cancellation route if any subscriptions are already active. Paid subscription creation/renewal was not exercised in this audit.

Evidence: `app/(buyer)/subscription/page.tsx:15`, `:39`; `firestore.rules:29`; `app/api/stripe/create-subscription/route.ts:62`; `app/api/stripe/webhook/route.ts:49`; `lib/server/moderation.ts:173`; `functions/src/subscriptions/processBorrows.ts:18`.

### F08 — Preorders do not enforce the release date

**Reproduced in the local emulator.** A buyer with a library entitlement can read an unreleased book's paid chapter. Purchase fulfillment immediately grants a normal library entry, and neither the reader access rule nor its purchase check considers `releaseDate`.

Hide new preorder publishing until checkout, fulfillment, previews, and chapter access consistently enforce release timing. Retain any existing obligations and communicate release dates accurately.

Evidence: `lib/server/fulfillPayment.ts:33`; `firestore.rules:29`; `app/(buyer)/book/[id]/page.tsx:286`.

### F09 — Promo-code creation is denied, and free offers cannot finish checkout

**Creation reproduced in the local emulator.** The seller form creates a new promo document, but its write rule checks the existing `resource.data.sellerId`, which does not exist on creation.

**Confirmed in source:** the form offers free discounts, while checkout rejects totals below $0.50. It stores start dates and one-per-customer options without enforcing them in checkout. These options should not be offered until supported.

Move promo creation/validation to a bounded server flow, support free entitlement fulfillment if desired, and enforce activation dates, per-user use, and concurrent usage limits.

Evidence: `app/(seller)/listings/page.tsx:91`; `firestore.rules:164`; `app/api/stripe/create-payment-intent/route.ts:95`.

### F10 — Receipt screen announces success before fulfillment is confirmed

**Confirmed in source.** It reads order documents once and unconditionally displays “Payment Successful,” “books are ready,” and “receipt has been sent,” without checking order completion or email-delivery state. A delayed webhook can therefore send a buyer to a reader that still has only preview access.

Wait for confirmed fulfillment, show a processing/retry state, and state email status accurately. This race was identified in code; no real payment was made.

Evidence: `components/buyer/CheckoutPaymentPanel.tsx:79`; `app/(buyer)/checkout/receipt/page.tsx:27`, `:53`, `:81`.

### F11 — Settings and earnings reports disagree with financial calculations

**Confirmed in source.** Admin fee and plan-price fields save successfully, but checkout uses a hardcoded 15% platform fee and subscriptions use separate hardcoded amounts or environment price IDs. By-book analytics estimates revenue as 70% of current list price times sales instead of summing actual order earnings. The payout table reads fields the payout producer does not write.

Use one pricing/fee configuration and actual transaction amounts; remove controls that have no effect until connected. Test a discounted sale against the seller's displayed earnings.

Evidence: `app/(admin)/admin/settings/page.tsx:73`; `lib/stripe/server.ts:23`; `app/api/stripe/create-subscription/route.ts:13`; `app/(seller)/analytics/page.tsx:202`, `:241`.

## Simplify or defer

### F12 — Co-author revenue sharing is only stored metadata

The profile editor records names, email addresses, and percentages, and displays “Your share.” Fulfillment and payouts credit only the primary seller. No invitation, acceptance, split-payment, or collaborator account flow was found. Aggregate shares are not capped at 100%. The current catalog has no co-author email records, but adding them would place those emails inside public book documents.

Remove financial split controls until real accounting exists. Keep optional public author-name credits separately.

Evidence: `components/seller/SellerProfileDrawer.tsx:211`, `:800`; `lib/server/fulfillPayment.ts:47`.

### F13 — Referral program has no earning or redemption path

Signup generates a code and initializes `referredBy` and credits. The profile displays a copy button and credits balance. No code-entry, attribution, reward-granting, or credit-redemption implementation was found.

Hide the referral section and credits promotion for now. Preserve stored data if there are historical credits to reconcile.

Evidence: `lib/firebase/auth.ts:24`, `:59`; `components/buyer/BuyerProfileDrawer.tsx:657`.

### F14 — Reader and privacy preferences are partly disconnected

Profile reader preferences are saved to Firestore, while the reader uses an independent local Zustand store. Theme names differ (`parchment`/`white` versus `paper`/`night`). “Share reading activity” only updates component state and resets. Weekly digest/reminder/other notification controls have no corresponding complete delivery flow in this repository; the push function does not inspect these preferences, and no browser FCM registration flow was found.

Keep the working in-reader controls, connect them to a single preference model, and hide unsupported privacy/notification switches. Do not imply that a privacy choice changes behavior when it does not.

Evidence: `components/buyer/BuyerProfileDrawer.tsx:153`, `:160`, `:635`, `:717`; `store/readerStore.ts:25`; `functions/src/notifications/sendNotification.ts:17`.

### F15 — Global mobile swipes interfere with browsing

**Reproduced in the production browser.** Swiping left on a horizontal book rail at `/browse` navigates to `/discover`. The document-level gesture listener does not exclude scrollable shelves or controls.

Remove global route-swiping and retain bottom navigation. Reader-specific chapter swipes can remain. If global gestures are retained, exclude horizontal scrollers and interactive regions.

Evidence: `components/buyer/BuyerSwipeNav.tsx:35`, `:47`, `:57`.

### F16 — Wishlist has a viewing/removal UI but no add action

The wishlist helper supports toggling entries, but the only UI calls found are removal buttons in profile views. Readers cannot add a book from the catalog, details, or reader.

Either add one “Save for later” action or hide the empty wishlist section. This is a small optional enhancement after the core fixes.

Evidence: `lib/firebase/firestore.ts:209`; `components/buyer/BuyerProfileDrawer.tsx:147`; `app/(buyer)/profile/[section]/page.tsx:125`.

### F17 — Preview percentage is an ineffective publishing control

The publishing form stores a preview percentage, but chapter access is determined by each chapter's `isPreview` flag. No reader or publishing transformation consumes the percentage. Two of the five live titles have no preview chapters; one of those is the empty title in F01.

Keep explicit chapter preview selection and remove the percentage selector, or implement one consistent percentage-based preview policy. Do not automatically expose paid content merely to fill an empty preview.

Evidence: `app/(seller)/publish/page.tsx:225`, `:271`, `:687`; `lib/firebase/firestore.ts:377`.

### F18 — Duplicate implementations add maintenance work

Buyer and seller profile screens each have large parallel page/drawer implementations. Their verification queries and error handling already differ. The sample page duplicates reading behavior now available in the main reader. `ChapterNav`, `ReaderProgress`, and `EbookTag` have no consumers found in app/components/lib searches.

Extract shared profile sections, redirect sample URLs to a supported preview mode, and remove confirmed unused components after an import check. This is lower priority than reader content, money, and broken author tools.

## Suggested work order

1. Protect buyers and authors: F01–F04, then review receipt/fulfillment behavior in F10.
2. Repair everyday use: F05–F06; fix promo creation in F09 if promos remain enabled.
3. Pause incomplete offers: F07–F08, F12–F14, and the ineffective control in F17.
4. Simplify navigation and optional screens: F15–F16 and F18; reconcile financial settings/reporting in F11 before relying on them operationally.

## Verification and limits

- Production checks were read-only: catalog/selected metadata counts, composite query validation using a nonexistent audit ID, and Cloud Function listing. No manuscript text, customer payment records, or private user profiles were inspected.
- Live browser checks reproduced the guest subscription dead end and the mobile book-rail navigation conflict. Subscription creation requests were blocked by the test harness; none were attempted by the observed guest flow.
- Local emulator checks reproduced denied seller promo creation, Basic access to a premium-only title, preorder access before release, and direct seller publication without approval. Only synthetic local records were written.
- Source findings are marked separately from live reproductions. Purchases, refunds, transfers, account deletion, and authenticated production author/admin mutations were not executed.
- No app behavior, production records, security rules, indexes, or billing configuration was changed by this assessment.
