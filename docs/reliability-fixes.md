# Assessment fixes

Implemented in priority order:

1. Firestore profiles are private to the account owner and admins. Client edits cannot change roles, subscription state, credits, or Stripe customer IDs. Author onboarding uses an authenticated server endpoint; public author pages use an explicit public-field response.
2. Orders, library entitlements, seller balances, and verification fields are server-controlled. Seller profile forms no longer rewrite financial fields from stale client snapshots.
3. Both chapter readers sanitize HTML with a formatting allowlist, including content already stored in Firestore.
4. Payment fulfillment commits orders, library access, earnings, sales counts, notifications, and promo usage in one transaction. A payment-ID record prevents duplicate credits. Checkout writes its orders atomically and validates server-side totals before charging.
5. Reader position loads per user and book. Completion is based on the final chapter; progress saves on chapter changes, inactivity, navigation, and page hiding. Preview readers query only preview chapters.
6. Author follows and verified reviews use server transactions. Repeated follows cannot inflate counts; reviews require a purchase and update ratings atomically. Helpful votes are limited to one per account.
7. Guests can browse, search, see book details, and read samples. Discover links select their corresponding search collection. Lint uses the ESLint CLI and matching Next.js configuration.

## Verification

- `npm test`: chapter HTML, reading-completion, and Firebase authentication runtime regression tests.
- `npm run test:rules`: local Firestore rules, fulfillment concurrency/retry, follows, and review tests. Requires Java 11 or newer and network access on the first run to download the pinned test-only emulator tooling. Uses `demo-afrobooks-security`; never a production project.
- `npm run lint`: correctness errors fail the command. Existing React Compiler migration and markup diagnostics remain warnings; React Compiler is not enabled in this app.
- `npm run build` and `functions/node_modules/.bin/tsc -p functions/tsconfig.json --noEmit`.

## Release

These changes require deploying both the Next.js app and `firestore.rules`. The new server endpoints must be available when the restrictive rules go live. Existing browser tabs may need a refresh. No production deployment is performed by the tests.

The `jwks-rsa` dependency uses a scoped `jose` 5 override so Firebase Admin authentication can load in Vercel runtimes where native `require(ESM)` is disabled. The runtime test exercises key retrieval and signature verification with that Node option disabled.

Rules changes do not repair historical data. Before enabling production payouts, review existing administrator roles, seller balances, subscription states, and library entitlements against trusted auth/payment records. Orders left partly fulfilled by the previous webhook need reconciliation; automatically crediting all historical completed orders would risk duplicate payments.

The full paid checkout, author onboarding, and reading flows still need a staging smoke test with Firebase and Stripe test credentials. Receipt email delivery remains a separate external operation from financial fulfillment.
