# Repair release — 26 September 2026

The [feature audit](feature-audit-2026-09-26.md) records the original findings. This release focuses on discovery, previews, individual purchases, reading, publishing and moderation.

| Finding | Resolution |
| --- | --- |
| F01 | The empty listing was unlisted as a draft, with its records preserved. Publishing, approval and checkout validate actual chapter content. Restoring that title still requires the author's original manuscript. |
| F02 | New manuscripts use private object paths. The dry-run-by-default migration moves the two existing archive references and revokes exposed download tokens without deleting files. |
| F03 | Seller writes stay in draft. Publication and approval transitions run on the server, with chapter/rights/verification checks. |
| F04 | Payouts reserve a fixed amount transactionally and use stable IDs and Stripe idempotency keys. Uncertain transfers older than 23 hours require reconciliation. Client “Mark Paid” actions are removed; unverified historical records are labeled. Automatic payouts remain paused until historical balances are reconciled. |
| F05 | Edit loads the existing book and chapters, preserves its ID and statistics, and saves through draft/publication validation. The form discloses temporary unlisting while edits are saved. |
| F06 | Four composite indexes are added. Reading and profile queries have failure states. Seller verification uses the latest submitted request. |
| F07 | New subscription sales/listings are paused in the UI and API. Existing subscribers have cancellation, tier/date checks and synchronized reporting. Account deletion cancels the linked subscription first. Borrow royalty automation is paused because complete read tracking does not exist. |
| F08 | New preorder offers are paused. Existing entitlements respect release dates in both client navigation and Firestore rules. |
| F09 | Promo creation/redemption is paused in UI, rules and checkout. Stored cart discounts are cleared by a persisted-state migration. Bundle discounts remain supported. |
| F10 | Receipts subscribe to order changes and wait for every order to complete. Processing, unavailable orders and unconfirmed email delivery are described accurately. |
| F11 | Checkout and publishing estimates share the configured direct-sale fee. Analytics sum actual completed-order earnings and use payout amounts. Unsupported financial settings and inert date-range buttons are removed. |
| F12–F14 | Financial co-author splits, referral rewards, unsupported privacy/digest/notification controls and their promotional claims are removed. Profile reader preferences use the reader's actual local store. |
| F15 | Global route swipes are removed; reader gestures remain. |
| F16 | Book details include a working Save for later action with sign-in and error handling. |
| F17 | Explicit chapter preview flags replace the ineffective percentage control. Paid chapters are never exposed automatically. |
| F18 | Legacy profile URLs open the shared drawers; sample URLs redirect to the main reader. Unused components are removed. |

Additional author fix: ID uploads store a private file path instead of requesting a download URL that the author cannot read under Storage rules. Admin document viewing uses an authenticated, non-cacheable server endpoint.

## Release sequence

The user authorized committing and deploying this repair release, including Firebase, and requested live Stripe payments. Production checkout requires matching live keys and a webhook signing secret; protected Vercel values cannot be verified by downloading them. Supplied test keys are not used to enable production payments.

1. Pass unit tests, emulator regressions, TypeScript, lint, production build and browser checks.
2. Commit the reviewed changes.
3. Deploy Firestore rules/indexes, Storage rules, the two revised scheduled payout functions, and Vercel. Do not delete indexes or unrelated functions. Storage rules now check the book's Firestore draft ownership; grant the Firebase Rules service agent the documented Firestore read permission when prompted by the CLI.
4. Run `node --env-file=.env.local scripts/privatize-manuscripts.mjs --apply` and verify no public manuscript URLs remain and the exposed tokens are revoked.
5. Verify the deployed reader, catalog, paused offers and index-dependent queries.

## Payout activation and reconciliation

The scheduled function deliberately requires `platformSettings/global.automatedPayoutsEnabled === true` and a server-set `sellers/{id}.payoutsReconciledAt`. Neither flag can be set by an author. Do not enable them just to make the scheduler run.

Before activation, reconcile each seller's existing balances and payout records against confirmed Stripe transfers. Legacy `paid` status alone is not proof of a transfer. Resolve older pending/failed records before enabling payouts for that seller. Record the review and timestamp through trusted administration.

New payouts reserve funds in `payouts/{sellerId}_{YYYY-MM}` and keep `activePayoutId` on the seller until confirmation. New sales accumulate separately. A `needs_review` reservation must be checked against Stripe by payout metadata before any transfer is retried or any funds are released. Record a confirmed transfer ID and complete the corresponding ledger transition; do not manually mark a payout paid without evidence. Stripe may prune idempotency keys after 24 hours; the worker stops ambiguous retries at 23 hours. [Stripe idempotency documentation](https://docs.stripe.com/api/idempotent_requests).

## Verification limits

Tests use synthetic emulator records and simulated transfer responses. Browser checks use guest access and do not charge cards, issue payouts, cancel real subscriptions or upload personal documents. New subscriptions, preorders, promo codes and subscription royalties are intentionally paused, not represented as complete products. Automatic payouts require the operational reconciliation above. The original manuscript for the unlisted empty book is not recoverable from the available stored content.

## Local interface follow-up

- Buyer profile: replaced crowded tabs with section rows and essential actions. Editing, saved-book removal, photo upload, password feedback, reading preferences, and modal keyboard behavior were checked with synthetic data.
- Seller first pass: responsive dashboard and book management, corrected edit/earnings links, searchable status filters, retryable loads, and removal feedback. The author profile now uses simple section rows, an accessible dialog, and shared account security. Rejected ID submissions can be resubmitted; upload validation, Stripe errors, and tax submission failures are visible. Author bio and seller fields save in one server transaction. Publishing-form and analytics-page modernization remain later steps in the seller plan.
- Discover: a read-only check found four live books with four reachable cover images. The old rating query returns `failed-precondition`; its failure previously rejected the whole recommendation load. Discover, Browse, and Search now use a single public catalog request and derive shelves locally, retaining records without sort fields. Server-only catalog reads distinguish network failure from an empty collection. Genre recommendations fall back to available titles when no preferred-genre books exist; popular/rated/featured shelves only appear when supported by data.
- Covers: shared cards render uploaded images in portrait frames, with details beneath. Missing or failed images have an explicit fallback. Library covers also use the shared renderer. Book-card clicks retain the reader destination.
- Validation: eight unit tests pass, including sparse-catalog recommendation regressions. Synthetic browser checks cover catalog retry, missing/broken images, genre updates, optional follow failures, seller profile saves/uploads/errors, and buyer account regression flows. Guest browser checks against the local app and live public catalog confirm all four covers load, mobile layouts fit, search works, and a cover opens readable content. These checks made no production data changes.

## Deletion and payment release checks

- Permanent deletion first hides the book, then removes its covers, manuscript archives, chapters (including nested content), private archive record, library/saved/progress/borrow records, reviews, reports, promotions and related notifications. A failed cleanup is retryable. A minimal server-only deletion receipt prevents reuse of the deleted identifier; purchase receipts and payout history remain intact.
- Catalog consumers share a server-confirmed live listener. Deleted books disappear from open catalog, library, saved, recent, cart, detail and reader views. Failed catalog requests do not erase a persisted cart. Stale editors, uploads, saved-list writes and publication attempts cannot restore removed books.
- Late payment callbacks cannot recreate a deleted book. Received payments for unavailable books enter `needs_review`, without crediting seller earnings or granting dead entitlements. The buyer receipt explains the review and the admin revenue page lists affected orders. Staff must reconcile/refund these in Stripe; no automatic refund is claimed.
- Production cleanup removed exactly three already-removed book records and one legacy cover. Verification found four live books and one preserved draft, with no orphaned chapters, private records, app references or book files. No purchase or payout records were deleted.
- Nine unit tests and twenty Firestore/Storage emulator tests pass. Emulator tests cover recursive cleanup, interrupted deletion/retry, blocked uploads, delayed/concurrent payments, payout idempotency and private reader access. Browser checks confirm removal from open catalog/library/saved/reader views and persisted cart/recent lists; the production build still displays all four real covers and opens readable previews. TypeScript, production builds for app/functions, and lint pass (existing warnings remain).
- Live payments still require validation against the actual Stripe account and registered webhook. Missing/mismatched keys, test keys in production, or a missing signing secret disable checkout. Do not treat a passing build or disabled checkout as proof that live payments work.
- The admin bootstrap function rejects requests when its server secret is missing and validates role/identifier inputs. Its release accompanies the scheduled-function safeguards.
- Both legacy manuscript archives were migrated to private references, and their public tokens were revoked. Anonymous requests to the former URLs are denied; original files and reader chapters remain.
