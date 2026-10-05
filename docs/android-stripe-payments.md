# Android purchases with Stripe — release gap

The owner confirmed on October 1, 2026 that readers should buy inside the Android
app and that market availability should follow a Stripe-compatible setup. A
reader-only Android release is not the selected product direction.

The owner also confirmed that the app is **not enrolled** in Google Play
alternative billing yet. Enrollment is an outstanding owner action, not an
unknown configuration state.

October 4 update: the owner selected standard Google Play Billing for one-time
**video** purchases. Version 3 (`1.0.2`) now includes the native video payment
bridge. The server supports live and license-test purchases with per-title
activation and creator earnings accounting. See [Video Play Billing setup](video-play-billing.md).
The bundle has not been uploaded by this work or tested with a real Play purchase.

The ebook checkout still uses Stripe inside the Trusted Web Activity. That
checkout alone is not a Google Play alternative-billing integration. The remaining
items below concern **ebooks if Stripe is retained inside the Play app**;
standard Play video purchases do not require alternative-billing enrollment.

## Available path and costs

Google permits alternative in-app billing for US users after program enrollment
and the required API integration. Its current page requires transaction reporting
within 24 hours and applicable service fees starting October 1, 2026. The first
$1 million annual-earnings tier is listed at 10%; later tiers vary. Stripe costs
remain separate. An initial US rollout is a possible Stripe-compatible path,
not an enrollment or country-selection action already taken.
[Google's US program](https://support.google.com/googleplay/android-developer/answer/16497028?hl=en)

The EEA has its own alternative-billing program, business-registration eligibility,
API/reporting requirements and service fees. Other markets must be evaluated
against their applicable programs; Stripe support alone does not establish Play
eligibility. [Google's EEA program](https://support.google.com/googleplay/android-developer/answer/12348241?hl=en)

## What still needs to be completed

1. Confirm and enroll the app in the selected Google Play alternative-billing
   program, including the owner's acceptance of its terms and service fees.
2. Deploy the owner-provided **App signing key certificate SHA-256**, now added
   to `assetlinks.json`, and verify association on the Play-installed app.
3. The Google Play Android Developer API is now enabled for project
   `252688487437` (`campusconnect-fecb1`). The owner has created and granted Play
   access to `afrobooks-play-billing@campusconnect-fecb1.iam.gserviceaccount.com`.
   Local application code successfully reads the empty product catalog using
   temporary credentials; the account setting is saved in Vercel Production.
   Deploy and verify the runtime; any alternative-billing-specific access still
   requires its separate program setup.
4. Implement the native Play eligibility/disclosure/token flow and a secure
   bridge to the TWA checkout; validate the supported integration against the
   enrolled program. A user-agent or URL flag alone is not sufficient.
5. Add authenticated reporting of completed external transactions and subsequent
   adjustments, with retries and duplicate protection. Preserve a permanent
   library entitlement and record Google service costs separately from Stripe
   processing and author royalties.
6. Review Android pricing and author earnings with the additional service costs,
   build a higher-version AAB, and test through Play's testing track before release.

The existing website keeps its Stripe checkout. This document does not change
distribution countries, accept Google program terms, alter author commission,
or claim the Android billing work is complete.

Technical reference:
[Google alternative billing APIs](https://developer.android.com/google/play/billing/alternative).
