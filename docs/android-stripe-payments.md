# Android purchases with Stripe — release gap

The owner confirmed on October 1, 2026 that readers should buy inside the Android
app and that market availability should follow a Stripe-compatible setup. A
reader-only Android release is not the selected product direction.

The owner also confirmed that the app is **not enrolled** in Google Play
alternative billing yet. Enrollment is an outstanding owner action, not an
unknown configuration state.

The current version-2 bundle opens the live website in a Trusted Web Activity.
Its Stripe checkout is not, by itself, a Google Play alternative-billing
integration. No new billing-enabled AAB or Play publication is claimed.

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
2. Supply the public **App signing key certificate SHA-256** from Play Console
   so `assetlinks.json` trusts the Play-signed app. Do not share private keys.
3. Enable the Google Play Android Developer API and configure least-privilege
   server access in Play Console. A read-only product-list request currently
   returns `403 accessNotConfigured` for project `252688487437`.
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
