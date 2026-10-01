# Stripe webhook investigation — September 30, 2026

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
