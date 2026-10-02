# Mobile connection, draft and form recovery

The website and installed app share these improvements; the Android wrapper does not need a new AAB for these web changes.

## Interrupted connections and purchases

- The connection banner retains the current screen and offers a connectivity check. It never reloads the page or replays a payment/save. Browser online events are hints; recovery is announced only after an uncached request succeeds.
- Failed catalog, ownership, author-list, pricing and receipt checks can resume when connectivity returns. A successful connectivity probe does not guarantee that Stripe or Firebase is available; their errors remain visible.
- Checkout stores only the authenticated user's pending order IDs in session storage **before** Stripe confirmation. Card details and client secrets are not persisted. A synchronous guard blocks double submission.
- An interrupted confirmation blocks the Pay button and offers **Check payment status** and **View order**, including after reloading that tab. `/api/stripe/recover-purchase` authenticates the buyer, verifies each order and reads the current Stripe intent. It cannot create or confirm a payment.
- Successful, processing, held, refunded or ambiguous payments go through receipt/review. Only an explicitly unpaid Stripe state permits a manual retry, which still passes the existing server-side ownership checks and payment locks. Receipt retry checks/fulfillment are idempotent.
- If browser storage is blocked, checkout stops before confirming a charge. Recovery references are scoped to the account and checkout type. Normal server payment locks remain the duplicate-charge protection across tabs/devices and if storage is cleared.

## Author drafts

- IndexedDB stores a versioned local draft per author and per edited book, including selected cover/manuscript/PDF files, accepted chapters, incomplete chapter edits, pricing, rights details and the current step.
- Changes save after a short pause; page hiding and navigation also request a save. A synchronous local-storage text checkpoint protects the last edit during an immediate reload when storage permits it; file bytes remain in IndexedDB. Reopening the publishing page restores the draft automatically. Editing another publication or switching accounts uses a different key.
- Local saving does not publish, withdraw, or change the server's book. Successful explicit save/publication removes the local recovery copy; failed saves retain it and the chosen book ID for retry.
- Storage failures are visible. A device crash before a write finishes, private-browsing restrictions, storage eviction, or clearing browser data can remove unsaved/local work. Drafts are device/browser-local, not cloud backups. Use one editing tab per book; simultaneous editing is not a collaborative workflow.
- An unfinished chapter must be saved or cancelled before publishing. File import still requires reviewing/accepting the converted chapters; in-progress OCR is not resumed after closing its tab.

## Mobile forms

- Phone/tablet inputs are at least 16px, and name/email/password fields offer appropriate autofill and keyboard hints. Narrow signup screens stack the name fields.
- VisualViewport measurements fit account dialogs above the on-screen keyboard, scroll focused fields into view, and hide bottom navigation while typing. Input values and the form remain mounted.
- Browsers supporting `interactive-widget=resizes-content` also resize the layout for the keyboard. Browser zoom is not disabled, and a zoomed visual viewport is not treated as a keyboard.

## Validation

`npm test` includes payment recovery authorization/state tests and a timeout test proving that mutations are not replayed.

`tests/mobile-recovery.browser.cjs` bundles the actual publishing screen, editor, payment form, connection banner and keyboard component with controlled Firebase/Stripe boundaries. Set `PLAYWRIGHT_PATH` to Playwright and optionally `EDGE_PATH` to a Chromium executable. It exercises IndexedDB restoration/file bytes, account/book isolation, interrupted checkout, reconnect and simulated keyboard/rotation. No real charge, email, upload or publication is used.

References: [Stripe payment-intent reuse](https://docs.stripe.com/payments/payment-intents), [browser online status limitations](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine), [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).
