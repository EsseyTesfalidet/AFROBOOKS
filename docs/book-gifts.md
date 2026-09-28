# Gift a Book

Readers can choose **Gift this book** on an available paid book, enter a recipient's email and an optional note, and pay through Stripe. Gifts contain one book and use the existing direct-sale fees and author royalty processing. Buying a gift does not change the sender's cart or library.

The Stripe success webhook marks the gift ready to claim and sends its email through Resend. `/gifts` shows the sender's latest 100 gifts, email acceptance status, claim status, a receipt, an interrupted-checkout resume link, and a copyable claim link. The library links to this page. Email status means Resend accepted the message; it does not guarantee inbox delivery.

The recipient opens `/gifts/claim#token=…`, signs in or creates an account with the specified email, verifies it if necessary, and explicitly claims the book. Email verification can be requested from the claim screen. The recipient should return to the original gift tab after verifying. A claim adds a purchased entitlement to their library and sends the sender an in-app notification.

## Configuration and release

- Deploy the app, `firestore.rules`, and `firestore.indexes.json` together. The new index is `bookGifts(senderId ascending, createdAt descending)`; sender history needs this index to be ready.
- The app server needs its existing working Stripe configuration, Firebase Admin configuration, `RESEND_API_KEY`, and an HTTPS `NEXT_PUBLIC_APP_URL`. Gift checkout refuses to start when email configuration is missing.
- Set `GIFT_EMAIL_FROM` to a sender on a verified Resend domain, or use the default `AfroBooks <noreply@afrobooks.com>` if that domain is verified. The existing receipt email uses its existing sender configuration.
- Keep `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`, and `charge.dispute.updated` enabled on the signed Stripe webhook. Stripe retries temporary fulfillment or gift-email failures.
- Keep the app domain authorized in Firebase Authentication so email verification links can return to the app.

No production emails, payments, or deployment are performed by the automated tests.

## Recovery and privacy

`bookGifts` is server-only, including for Firestore admin clients. Its private documents hold the recipient email, personal note, raw claim token, token hash, and delivery state. Orders contain only a gift ID, so authors cannot read recipients' email addresses or notes. All gift API actions use authenticated POST requests and no-store responses; private history is not eligible for the PWA's generic GET cache.

Each checkout attempt creates one deterministic gift and order before contacting Stripe, and uses a stable Stripe idempotency key. Browser session storage preserves the attempt across refreshes; **Resume checkout** retrieves the same attempt from the server, including on another device. Changing immutable gift details on that attempt is rejected. Attempts older than 23 hours without a saved Stripe payment ID stop for review instead of risking another charge.

The payment webhook grants no sender entitlement. Claim transactions check the current payment, order, book, recipient account, and existing library entry. Recipient identity comes from Firebase Auth's verified email, never from an editable profile field. Duplicate claims by the same recipient are idempotent. A different account cannot reuse a claimed gift even if it later obtains the same email address.

The claim secret travels in a URL fragment and a POST body, not an API query string. Opening a link does not consume it, so email scanners cannot claim a gift. Someone who already permanently owns the book receives an explanation and leaves the gift unclaimed; a subscription copy can be replaced by the gift purchase.

Email retries share one persisted payload and provider idempotency key. A lease prevents concurrent sends. Ambiguous attempts older than 23 hours are marked for review; they are not automatically resent beyond Resend's idempotency window. The sender can still share the original claim link. See [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

Refunds or disputes mark gifts for review and revoke only the library entitlement created by that gift, preserving any later independent purchase. A deleted book also marks its gifts for review. Gift email retries do not reactivate reviewed gifts.

This version has no recipient reassignment, automatic gift expiration, or self-service gift refunds. Existing support and Stripe review procedures handle incorrect addresses, already-owned books, unavailable books, refunds, and disputes. Never reset an ambiguous payment or email attempt simply to retry it.

## Validation

Run `npm test`, `npm run test:rules`, and `npm run build`. Gift coverage includes validation, safe auth destinations, escaped email content, concurrent checkout preparation, webhook deduplication, private data rules, verified recipient checks, concurrent claims, already-owned books, blocked accounts, unavailable content, refunds, and email retry recovery. The emulator suite uses a demo project and fake email/payment state.

Before release, exercise a Stripe test-mode purchase with a verified Resend test recipient on staging: purchase, follow the actual email, create or sign in to the recipient account, verify and claim, check library access and sender status, then refund in Stripe and confirm access is removed. This external service smoke test is separate from the automated local checks.
