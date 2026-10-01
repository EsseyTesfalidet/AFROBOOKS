# Author payout setup reminders

`processAuthorPayoutReminders` checks authors hourly. It creates one in-app setup notification and queues one email when an author has not connected Stripe or Stripe currently requests details. It creates one follow-up seven days after the first notification if action is still required. There are at most two setup reminders per author; this is not an ongoing marketing campaign. Existing authors are included on the first run.

The job retrieves the current Stripe account before acting, checks account ownership, and skips suspended/banned accounts, removed users, non-authors, and authors whose payouts are on a financial-review hold. A completed setup stops email delivery and marks old setup notifications read. When Stripe is reviewing details and exposes no outstanding author action, the job posts a separate one-time in-app status message and pauses setup emails. Rejected/restricted accounts are not told to supply missing bank details. This job is independent of the switch that pauses royalty transfers.

Both notifications and emails point to `/dashboard?profile=payout`. This destination is preserved through email/password and Google sign-in, including authors currently using the buyer workspace. The author opens a fresh Stripe link through the existing Payouts screen. Bank details, identity documents and expiring Stripe onboarding links are never included in email.

## Configuration and release

October 1 verification: the function and hourly scheduler are deployed and active.
Both secret bindings exist; the configured sender is `AfroBooks <noreply@afrobs.com>`
and `afrobs.com` is verified by Resend. Ten reminder emails have provider acceptance
records. This is not inbox-delivery confirmation. The instructions below are for
configuring another deployment, not an outstanding production setup task.

The function is added to the source exports; implementing this feature does not deploy it or send messages.

Before deploying, configure these in the **Firebase Functions** environment (Vercel variables alone do not configure scheduled functions):

- Google Secret Manager `STRIPE_SECRET_KEY`: the platform's matching live Stripe key, already used by the royalty function.
- Google Secret Manager `RESEND_API_KEY`: a valid Resend sending key.
- Firebase string parameter `PAYOUT_REMINDER_APP_URL`: defaults to `https://afrobs.com`; must use HTTPS.
- Firebase string parameter `PAYOUT_REMINDER_EMAIL_FROM`: defaults to the existing app sender, `AfroBooks <noreply@afrobooks.com>`. Set this to a sender on a domain verified in your Resend account. The default is not proof that this domain is verified.

Build with `npm run build --prefix functions`. Release the app updates (including the login return link), Firestore rules and `functions:processAuthorPayoutReminders` through the project's deployment process. Deploy the scheduled function last: deployment starts hourly outreach to eligible existing authors. Review the sender, destination URL and audience first. The existing notification-create function may also send push notifications to users with an FCM token.

## Delivery tracking

`authorPayoutReminders/{uid}` and its `emails/{initial|followup}` subcollection are server-only. They contain notification timestamps, immutable email payloads, email leases, and provider acceptance IDs. They are removed by account deletion. Email status `sent` means Resend accepted the request, not that it reached the inbox. This feature does not yet ingest bounce/delivery webhooks.

Firestore transactions and stable notification identifiers prevent duplicate in-app reminders. Email retries preserve the payload and use a stable Resend idempotency key. A ten-minute lease prevents concurrent sends. Attempts with an unknown outcome older than 23 hours are marked `needs_review` rather than risking a duplicate after Resend's 24-hour deduplication period. Inspect Resend logs before resolving these records; do not clear attempt history blindly. Missing email configuration leaves messages pending and allows in-app reminders to proceed. An unsent initial email older than seven days is superseded by the follow-up so enabling email later does not deliver both at once.

The hourly scan reads authors in pages of 100. At larger scale, move to a persisted work cursor or per-author task queue before a complete scan approaches the function's nine-minute timeout.

## Validation

Unit tests cover account-state classification, safe links and HTML escaping, provider failures, and accepted response IDs. Firebase emulator tests cover concurrency, the seven-day limit, current Stripe readiness, review pauses, lost-response recovery, expired retry windows, missing configuration, eligibility, account ownership, and Firestore privacy rules. All email and Stripe calls in tests use synthetic gateways; no author is contacted.

Provider references: [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys), [Stripe verification requirements](https://docs.stripe.com/connect/handling-api-verification).
