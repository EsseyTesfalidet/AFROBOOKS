# Stripe webhook investigation — September 30, 2026

## Resolution update — October 1, 2026 UTC

Real Stripe deliveries to the previous endpoint were confirmed returning HTTP 400 in Vercel request logs. Replaced the failing endpoint with a new endpoint using the same URL, event subscriptions and API version, securely updated the production signing secret, and redeployed. A real Stripe resend of the harmless `tax.settings.updated` event returned HTTP 200 at **03:36:27.799 UTC**, on deployment `dpl_7XNH7CtEvb1F5opUmMNUkXZpF4f4`. The previous endpoint was then disabled, preserving its delivery history.

- Active endpoint: `we_1ULakRDjnbhpFDjEoPt3Y9rk`.
- Previous disabled endpoint: `we_1UKBR1DjnbhpFDjE2RUVHcCF`.
- `automatedPayoutsEnabled` is true. The updated hourly royalty worker is active, with its scheduler enabled.
- The author involved in the reported purchases has an ownership-matched US connected account with active transfers and payouts, and no payout hold.
- The two inspected $6.99 purchases were still pending in the application. One was already fully refunded; the second was also fully refunded by the time recovery ran. The recovery guard stopped before resending its success event. No author transfer, new charge or refund was initiated during this repair. The user requested leaving the refunds alone.
- The author transfer for a new, non-refunded purchase remains to be verified. The existing separate-charge/automatic-transfer flow is enabled; direct destination charges remain off pending the eligible-account Stripe test described in `destination-charges.md`.

The findings below describe the earlier investigation, before this repair. No secret values are stored in this document.

## Original investigation

Stripe reported 16 unsuccessful deliveries beginning September 27 at 09:37:45 UTC to `https://afrobs.com/api/stripe/webhook`.

## Verified findings

- The live endpoint is reachable without redirects. Unsigned requests return 400 (`No signature`); invalid signatures return 400 (`Webhook signature verification failed`). These are expected security checks, not reproductions of Stripe's failure.
- A deliberately unhandled, harmless event signed with Vercel's currently configured webhook secret returned 200 (`received: true`). No purchase or account record was changed. This confirms the handler can accept that secret; it does **not** establish that the registered Stripe endpoint uses the same secret.
- The expected live Stripe account has charges and payouts enabled. Its webhook is enabled and points to the correct URL.
- The Stripe events API returned three events since September 27 at 09:00 UTC: `account.updated`, `capability.updated`, and `tax.settings.updated`. Each still had one pending webhook delivery. There were no payment events in that interval.
- The Stripe payment-intent query found zero payment intents created in the interval, so there were no recent successful purchases to reconcile against orders or reader libraries. This is not a lifetime transaction audit.
- The checked application build and TypeScript compilation passed.

The original failure remains unconfirmed. Available Vercel request logs did not include the original failed deliveries. No signing secret, Stripe endpoint configuration, or payment records were changed.

## Next evidence needed

In [Stripe Webhooks](https://dashboard.stripe.com/webhooks), open the endpoint and inspect a failed event delivery. Record its HTTP status, response body, and delivery time. Retry one of the pending account-setting events and inspect the new response.

- A fresh 200 indicates delivery is working; retry the remaining pending events.
- A 400 with `Webhook signature verification failed` requires comparing this endpoint's signing secret with Vercel's production `STRIPE_WEBHOOK_SECRET`. Update it through Vercel's secret settings and redeploy if they differ. Do not paste secrets into chat or logs.
- A 503 indicates payment configuration needs review.
- A 500 or timeout needs the matching Vercel request log to identify the failing operation.

Do not remove signature verification or acknowledge unprocessed payments just to stop retries.

## Read-only diagnostic

`scripts/stripe-incident-audit.cjs` was run inside a Vercel build with production credentials. It prints only configuration metadata, event IDs/types, and reconciliation counts; it does not export credentials or customer payloads. The diagnostic deployment was created with `--skip-domain`; it was not promoted to `afrobs.com`.

Reference: [Stripe webhook troubleshooting](https://docs.stripe.com/webhooks).
