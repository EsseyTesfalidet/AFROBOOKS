# Earlier-request audit — October 1, 2026

This is the current checklist for the requests in the conversation. Earlier
dated release notes describe their state at that time; they are not a current
list of unfinished work. The audit distinguishes working code, live configuration,
test evidence, and decisions that still need the owner.

| Request | Current result | Remaining limitation or action |
| --- | --- | --- |
| Pay authors their share | Automatic royalty worker is active and enabled. Destination routing for eligible single-author, same-country purchases is included in this release. Multi-author/cross-country purchases retain automatic source-linked transfers. | Each author must finish Stripe onboarding. One connected author is currently ready; another connected author is incomplete. No real purchase or bank payout was created for this audit. |
| Repair Stripe webhook failures | Real Stripe deliveries return HTTP 200 with the repaired endpoint/signing secret; rechecked October 1. Book refund events now synchronize order status and purchased access. | Refund transactions themselves are unchanged. Partial refunds and royalty recovery require financial review; see `book-refund-synchronization.md`. |
| Buy once and keep the book | Server duplicate guards, live ownership, cart cleanup, receipt recovery and library-open recovery are deployed. Paid books show Read; missing entries recover from verified purchases. | Requires the purchasing account. Unpaid/refunded payments do not create a purchased entitlement; removed content is not recreated. |
| Remind authors about missing payment details | Hourly function and scheduler are active. Sender is `noreply@afrobs.com`; the domain is verified. Ten reminder emails show provider acceptance. | Acceptance is not proof of inbox delivery. No manual reminder was sent during this audit. |
| Flexible/hybrid pricing | Authors retain final control, receive suggested ranges, see estimated earnings and can price from desired earnings. Existing prices are preserved. | Suggestions are editorial guidance, not AI market predictions. |
| Magazines for authors/organizations | Magazine issues are individual priced publications. Publisher name can represent an organization. Private PDF upload preserves images and layouts. | Organization accounts use the existing author role, not multi-user team administration. No recurring magazine subscription was requested or added. |
| Cheap short stories in bulk | Stories start at 10 cents; up to 20 titles share one payment. Sub-50-cent titles require a $1 cart after discounts, disclosed before checkout. | Authors choose actual prices; card processing and commission still apply. |
| PDF to editable chapters | Text PDFs import into the editor. Image PDFs have browser OCR and a review step. TXT/Markdown remain supported. | Complex layouts/images are not reproduced in editable prose; illustrated magazine PDFs preserve their original pages. |
| Other languages, especially Tigrinya | Unicode text import, localized chapter headings, Ethiopic font coverage and nine OCR language models include Tigrinya. | OCR needs author review; no system can promise perfect recognition for every scan. |
| Modern app typography | DM Sans and Manrope for the interface, Ethiopic fallback, shared type scale; reader preferences remain separate. | This release compresses fonts to WOFF2 while preserving every glyph and width. |
| Modern logo, About page, icon and feature graphic | Branding and About styling are implemented. PNG icons and a 1024×500 feature graphic are present. | Assets: `public/pwa-512x512.png`, `public/brand/afrobooks-feature-graphic.png`. |
| Header/footer and mobile rotation | Shared buyer navigation/footer and responsive portrait/landscape styles are implemented. Android/PWA orientation is unrestricted. | Browser testing is not physical-device testing. |
| Community features without confusing the book flow | Separate Community page contains Weekly Question and Find a Memory, with admin moderation and reports. | No question is published yet. The owner chooses and publishes the first question at `/admin/community`. |
| Gifting and author promotion services | Book gifting, recipient claiming, private records and retry protection are implemented. Author promotions have a moderated, free seven-day pilot and configurable pricing. | No end-to-end test email to a real gift recipient was sent during this audit. Paid promotion activation follows its documented approval/payment flow. |
| Android AAB and reused version code | Signed `dist/android/afrobooks-1.0.1.aab`, version code 2, exists. The wrapper loads the live website, so these website updates do not require another AAB. The owner confirmed purchases inside Android and a preference for Stripe. | Play Console upload is not verified here. App linking needs Google's public app-signing certificate fingerprint. Stripe inside Play requires eligible markets, program enrollment and the corresponding billing/reporting integration; these are not complete. The Android Developer API currently returns `403 accessNotConfigured`. See `android-stripe-payments.md`. |
| iOS support | Responsive Safari website and Add to Home Screen installation support exist. | No native App Store build or physical iPhone certification is claimed. |
| Security review and tests | Authorization, private files, server-owned payments, token revocation, suspension, email escaping, security headers and private-cache protection are implemented and tested. | This is not a guarantee against every breach. Provider account MFA and ongoing monitoring remain owner operations. |
| Performance optimization | This release removes the duplicate catalog read and replaces three TTF downloads with smaller WOFF2 files. Slow initial catalog connections retain a timeout/retry state. | Full-catalog pagination, cover variants and further layout-shift tuning are future scaling work, not implemented in this release. Current live catalog has five titles, all with chapters. |

## Proposals, not approved implementation work

The AI cover generator was explicitly kept as a proposal. Selling personal
diaries, an African video platform and the earlier general AI/service ideas were
discussion items, not approved builds. They have not been silently added.

New subscriptions, preorder offers, referral rewards and financial co-author
splits remain intentionally paused/hidden where documented in the September 26
repair release; this audit does not re-enable unfinished financial features.

## New verification and corrections

- Release commit `796ca59` was built and promoted to `https://afrobs.com` as
  Vercel deployment `dpl_8YZgm5DSFgCKu75E93KdaQH7RcV3`. Destination charges
  are enabled in this deployment and in the production project configuration.
- Live checks passed for payment/library authorization, publication filters,
  bundle-price disclosure, PDF worker delivery, and portrait/landscape layouts.
  Browser checks loaded all three deployed WOFF2 fonts, including Tigrinya,
  without injected CSS or substituted assets; no browser exceptions occurred.
- A fresh Stripe webhook probe returned HTTP 200 on the promoted deployment
  at 04:23 UTC. Unsigned probe requests correctly returned HTTP 400.
- The owner confirmed Google Play alternative billing is not enrolled yet.
  Android purchases remain an unfinished release requirement.

- 61 unit tests and 102 Firestore/Storage/Community integration tests passed.
  TypeScript checking passed. The integration rerun verified the test-project
  isolation correction described below.

- Real Stripe test-mode destination payment: $10 gross, $2 retained under the
  current fee calculation, $8 author net. The actual transfer and application
  fee were retrieved and verified. The synthetic refund/reversal passed and the
  temporary account was closed. Bank verification/payout delivery was not tested.
- Stripe can create the destination transfer asynchronously. The test waits for
  it; the application already defers fulfillment until the transfer can be verified.
- Fresh real Stripe webhook probe returned HTTP 200 on the live site. All five
  Cloud Functions are active; the author reminder and royalty schedulers are enabled.
- The Community integration suite now has its own emulator project. It previously
  shared a project with the core tests, letting parallel resets erase fixtures.
  Community is now included in the normal integration-test command.
- Three fonts shrink from 1,548,032 to 539,600 bytes (about 65% smaller files).
  Conversion verifies identical Unicode coverage and glyph widths. This is a file
  size comparison, not a measured 65% page-speed improvement.

For Android's remaining payment decision, see
[Google Play payment guidance](https://support.google.com/googleplay/android-developer/answer/10281818).
For synthetic connected-account verification, see
[Stripe Connect testing](https://docs.stripe.com/connect/testing).
