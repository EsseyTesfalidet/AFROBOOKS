# Purchased library recovery

A verified book purchase creates a permanent `bought` library entry for that
reader. Opening the library now also reconciles the reader's own receipts, so
closing the checkout tab or missing a webhook does not require another purchase.

- `POST /api/library/sync` requires authentication, derives the reader from the
  verified session, and scans receipts in pages of 20. Optional book filtering
  uses the `orders` buyerId/bookId index.
- Pending purchases are checked with Stripe and fulfilled by the existing
  idempotent transaction. Unpaid, refunded, disputed, or unverified payments do
  not grant access. Confirmed royalties use the existing transfer retry flow.
- A completed receipt can repair a missing library entry without creating a
  charge or crediting another sale. Removed books and gifts sent to someone
  else are excluded.
- Book details and the reader listen for ownership changes, including purchases
  on another device. Unknown or failed ownership checks do not expose a new buy
  button. Checkout still independently enforces ownership and payment locks.
- The library uses saved entries directly, without filtering against the public
  catalog. An unavailable title stays visible with an availability message.

Validation: 22 payment/library integration tests against the Firestore emulator,
20 checkout/security tests, TypeScript checking, and the browser ownership
regression passed. No live charges were created for testing.

Browser regression:

```powershell
$env:PLAYWRIGHT_PATH = (Resolve-Path '.vercel/reader-check/node_modules/playwright').Path
$env:EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node tests/ownership.browser.cjs
```

The browser test bundles the actual ownership hook with controlled auth and
Firestore boundaries. It checks live Buy-to-Read updates, cached missing entries,
account switching, provider errors, and a purchase arriving during recovery.
