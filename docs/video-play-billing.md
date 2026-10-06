# Google Play video checkout

October 4, 2026: one-time video checkout supports live purchases and license
testing. The owner selected **80% creator / 20% AfroBooks**, calculated from
Google's reported revenue after fees, taxes and refunds.

## Implemented behavior

- One immutable Play product per video, with one active single-quantity buy option.
- Localized Play price and native payment sheet in the Play-installed Android app.
- Server verification of product, purchase status and obfuscated AfroBooks account.
- Transactional library ownership before acknowledgement; pending payments stay locked.
- Owned videos cannot be bought again. Restore repairs interrupted verification.
- Refunds revoke the matching purchase; old refunds cannot revoke a later repurchase.
- A new full-video playback token requires a current Google purchase check.
- Private earnings ledger using Google's actual net revenue and exact integer
  nanounits. No estimated Google fee percentage or mixing buyer currencies.
- Creator and admin earnings screens with per-sale Google reconciliation.
- Full refunds reverse earnings; partial refunds use the updated Google net.
- Test purchases grant test access but never create real earnings.

Google net $5.95 produces creator earnings $4.76 and AfroBooks earnings $1.19.
The source is the Orders API's `developerRevenueInBuyerCurrency` field.
[Google Orders API](https://developers.google.com/android-publisher/api-ref/rest/v3/orders)

Google pays the platform. Monthly creator transfers now use the existing Stripe
Connected Accounts after the owner funds Stripe and registers a verified top-up
in admin. Google net revenue is split 80/20; Stripe transfer and bank payout status
are distinct. Currency conversion is not guessed: funding must match the sales
currency. Audio purchases now share this pipeline. Music subscriptions use a separate membership and listening ledger; see [Listen setup](listen-release.md). Custom receipt emails are not included. See
[Monthly video payouts](video-payouts.md).

## Production configuration

The billing identity is
`afrobooks-play-billing@campusconnect-fecb1.iam.gserviceaccount.com`.
The server mints temporary credentials through the existing Firebase service
identity. No new private key was downloaded. Read-only access to the current
`oneTimeProducts` API succeeds; the catalog currently contains no products.

| Server variable | Configuration |
| --- | --- |
| GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL | Dedicated billing identity above; saved in Vercel Production |
| FIREBASE_ADMIN_SERVICE_ACCOUNT | Existing sensitive server credential |
| GOOGLE_PLAY_RTDN_AUDIENCE | https://afrobs.com/api/watch/play/notifications |
| GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL | afrobooks-play-notifications@campusconnect-fecb1.iam.gserviceaccount.com |
| WATCH_PLAY_LIVE_ENABLED | true in Production; each title still requires explicit admin activation |
| WATCH_PLAY_TEST_UIDS | Optional comma-separated Firebase UIDs for test-only offers; currently unset |

Keep every variable server-only. `GOOGLE_PLAY_SERVICE_ACCOUNT` is an optional
dedicated JSON key and takes precedence if present; it is not needed here.
Failed credentials never fall back to another billing identity.

## Complete the Play Console connection

Google Cloud resources have been provisioned:

- Topic: `projects/campusconnect-fecb1/topics/afrobooks-play-notifications`
- Authenticated push subscription:
  `projects/campusconnect-fecb1/subscriptions/afrobooks-play-notifications-web`
- Endpoint and exact OIDC audience: `https://afrobs.com/api/watch/play/notifications`
- Separate notification identity, no billing permissions or downloaded key.
- Google Play notification service can publish to this topic; the Pub/Sub service
  agent can mint tokens for the notification identity.
- Retry backoff 10-600 seconds, 7-day retention and no subscription expiration.

In **Play Console > Monetization setup > Real-time developer notifications**, enter
the topic, enable one-time-product notifications and save. Send
a test notification after configuration changes. Admin > Videos shows the last received test. **A successful
Console test is required before enabling a live product.** Infrastructure probes
are recorded separately and cannot satisfy that gate. The handler verifies
Google's signed identity; purchase events fetch authoritative Google state.

Monitor subscription delivery failures and retry retained messages after outages.
An authenticated scheduled worker retries purchase/financial reconciliation and
eligible funded monthly transfers. Restore, playback, notifications and Refresh
sale also retry verification. A delayed financial API response
leaves earnings pending while preserving and acknowledging a verified paid purchase.

[Google RTDN setup](https://developer.android.com/google/play/billing/getting-ready),
[authenticated Pub/Sub push](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).

## Publish the first paid video

1. Upload `dist/android/afrobooks-1.0.2.aab` (version code 3) to the internal or
   closed Play track. Install the Play copy with a compatible Chrome browser.
   The old wrapper and ordinary web browser do not provide this native checkout.
2. Apply as a creator in `/video-studio`. Admin approves the creator and quota.
3. Upload the licensed video, cover and optional separate trailer/captions. Submit
   it; admin reviews and publishes after Cloudflare finishes processing.
4. Create one active Play one-time product named `afrobooks_video_your_film`.
   Set market availability and prices in Play Console. Configure exactly one
   standard buy option; no rental, preorder or multi-quantity. Play's localized
   price is authoritative at checkout; the studio price is a catalog guide.
5. In `/admin/videos`, open the published title, enter the exact product ID and
   select **Enable real purchases**. The server checks notification readiness,
   Google product state, processed media and approved creator before saving.
6. Run a license-test purchase, restore, refund/revoke and repurchase on a physical
   device. Google's license testers can use test cards even with a live offer;
   those transactions produce no real earnings.

For test-only offers, also allowlist the reader's Firebase UID and choose
**Enable checkout for configured license testers** in admin. Test track membership
alone does not make payments free; configure license testing and use Google's test
cards. The owner postponed this device step, so no actual Google purchase has been
performed by this work.

## Acceptance checks and limits

Unit, Firestore integration and browser tests cover both purchase modes, wrong
accounts/products, concurrent duplicate verification, pending payments,
acknowledgement failure, restore, refunds, repurchase ordering, exact 80/20 earnings,
delayed finances, stale financial updates and direct-client denial. These tests
simulate Google and do not replace a purchase on a Play-installed device.

No creators, published videos or Play products existed at the last read-only
production inspection. No real upload or paid playback has been verified.
Google is rechecked before a new Stream token; existing tokens can remain valid
until expiry (1-4 hours). Refunded entries may remain saved bookmarks but no longer
have purchased access. Earnings views show up to 100 sales in their buyer currencies.

The Android ebook billing gap remains separate:
[Android Stripe payments](android-stripe-payments.md).

## Production release verification

October 4, 2026: deployed to https://afrobs.com. Vercel deployment
`dpl_EAATJRUmVtqdSfRZ5t5q6YrVPPr3` is READY and the production alias is attached.
The website, sign-in and browse routes return HTTP 200; protected pages redirect
to sign-in and private APIs reject unauthenticated requests. Both Android signing
fingerprints are served directly over HTTPS. The new catalog index is READY and
production Firestore rules match the tested local rules.

Validation: 125 unit/regression tests, 26 Firestore integration tests, browser
flows, TypeScript, production build and targeted lint (zero errors; four image
warnings) passed. Provider/browser responses in automated tests are simulated.
No Play purchase, video upload or creator payout has been performed.

The live authenticated Pub/Sub infrastructure probe was delivered successfully
and recorded by the production endpoint. This verifies the push subscription,
OIDC authentication and server/database access. The Play Console test has also been received successfully and is tracked separately.
Neither test created a purchase or earnings record.

The release API accepted the version-3 bundle upload but returned HTTP 403 for
updating the alpha track and committing the edit. It has not rolled out. The owner
must grant the billing identity app-scoped testing-release permission or complete
the upload in the existing closed track. Existing tester enrollment should be kept.

### Final website update, October 4

Deployment `dpl_5663N9NPRbjMyEXUpv292o3vaWeK` is READY and aliased to afrobs.com.
Monthly funding and transfers, the authenticated reconciliation worker, creator
entry links and the Screen search/library layout fixes are included. The updated
Firebase `processMonthlyPayouts` function was deployed successfully as well.

Validation: 126 unit/regression tests and 39 Firestore integration tests passed.
Creator handoff and Screen browser flows passed with simulated authentication and
provider boundaries, including sign-in return to the video editor. TypeScript,
production build and targeted lint passed (zero errors; plain-image warnings).
Production smoke checks passed for public pages, protected pages, unauthenticated
API/worker rejection and both Android signing fingerprints. No real Play purchase
or creator payout was made. The native closed-track permission blocker above remains.
