# AfroBooks Listen

Mobile navigation is Browse, Screen, Listen, Library. Account stays behind the
header profile picture; the floating dock and selected-icon lift are preserved.
Desktop bookstore navigation is unchanged. Creators use `/audio-studio`, linked
from their profile and author navigation. Admin reviews audio at `/admin/audio`.

## Audio publishing and listening

Creators upload Music, Podcasts or Audiobooks as MP3 files, up to 250 MB each,
with 20 active uploads per creator. Titles, descriptions and language names are
Unicode, including Tigrinya. A title currently contains one recording; multi-track
albums and audiobook chapter manifests are not part of this release.

Uploads go directly to Firebase Storage with resumable progress and cancellation.
Only the owner of a server-created draft can create its original file. Finalizing
validates size, MIME and MP3 signature, copies to an immutable, server-only object
without Firebase download tokens, removes the staging file, and marks it ready.
No audio transcoding or Cloudflare processing is needed. A completed upload can
be recovered after a connection failure by selecting the same file again.

The creator previews and submits; admin previews and approves or returns it with
feedback. Editing published metadata requires withdrawal and another review.
Removal hides records and deletes files; titles with checkout mappings or
purchases must instead be withdrawn so existing buyers retain access.

The mobile player provides play/pause, seeking, 15-second skips, speed, resume
and a mini-player across buyer pages. It stops for sign-out/account changes,
reader/video detail pages, and checkout. Background playback uses HTML audio and
the browser's Media Session support; it remains subject to OS/browser limits.
The service worker never caches private audio or signed URLs. Playback URLs last
four hours for other audio and 15 minutes for subscription music. Previously
issued URLs can remain usable until expiry; there is no DRM/offline-download mode.

## One-time audio purchases

Podcasts and audiobooks can be free or paid, starting at $0.99 USD. Android
checkout uses Google's actual localized price. Admin maps a Play one-time
product with prefix `afrobooks_audio_` to each paid title. Product mappings are
immutable. Changing a draft price disables its checkout flags until admin
reconfirms the Play price and re-enables it.

Video and audio share the existing verified Google purchase, refund, restore,
earnings and monthly Stripe payout pipeline. Audio library grants are stored
separately in `audioEntitlements`. Pending payments never unlock audio; an active
purchase prevents another checkout. An old refund cannot revoke a repurchase.

## Monthly music pass

Music can be free or included in one catalogue-wide music subscription. Creators
explicitly opt recordings in; it does not include separately sold podcasts or
audiobooks. Recommended starting US price: **$2.99/month**, with regional prices
configured in Play Console. This is a starting business decision, not a profit
guarantee. Review Storage bandwidth and actual listening costs after launch.

Google reports a 15% service fee for auto-renewing subscriptions. The accounting
code uses actual verified net revenue, not that estimated percentage. Of that
net, 80% funds artists and 20% is the platform share. Each subscriber's artist
pool is divided by their qualifying listening time at the end of their billing
cycle. Artist totals under 30 seconds do not qualify. Server-bound sessions,
elapsed-time caps, one active session per listener, and replay checks constrain
listening reports. Browser reports are not proof of human attention; keep
monitoring for abuse. Cycles without qualifying listening or verified revenue
remain held and visible to admin, rather than becoming invented artist earnings.

Settlement writes into the existing monthly payout ledger, in the original
currency. Refunds reverse/reduce shares; pending refunds block payout. Google
settlement, owner-funded Stripe balance, and payout-account readiness are still
required. A billing cycle must close before allocation, so its transfer can fall
in the following payout month. Test subscriptions never create money entries.

Subscription state comes from `purchases.subscriptionsv2.get`, with account
binding and server acknowledgement. Active and grace-period memberships work;
cancellation keeps access through the paid expiry. Hold, pause, pending and
expired memberships cannot start playback. Restore, authenticated Google
notifications and the scheduled reconciliation job refresh membership and orders.

## Required Play setup before paid launch

1. Upload the new **1.0.3 / version code 4** bundle to the existing testing track.
   Earlier bundles only accept video SKUs. This does not create a new Play app.
2. Create subscription `afrobooks_music_monthly`, one auto-renewing base plan
   `monthly`, billing period one month. Start with $2.99 USD and review regional
   prices. No trial, introductory offer, prepaid or alternative base plan yet.
3. Use the existing Google notification topic; subscription notifications must
   reach `/api/watch/play/notifications`. Send the Console test notification.
4. Add license testers and their server `WATCH_PLAY_TEST_UIDS`, then enable music
   testing in Admin → Audio → Music subscription setup. Test on the Play-installed
   version 4 app with the same AfroBooks account, including cancellation/restore.
5. Configure each paid podcast/audiobook's `afrobooks_audio_…` product separately.
6. Only after those checks, enable live music subscriptions and title purchases
   in admin. New music settings default to disabled. Never treat a website
   deployment, mocked checkout or successful AAB compilation as a real Play test.

Storage upload rules must deploy with the app. Firestore audio/music records are
server-only under the existing default-deny rules; there are no new public writes.
Storage and delivery use the existing paid Firebase project, not a free hosting
guarantee. The optional `scripts/prepare-music-subscription.ts` creates only an inactive draft with local prices. The October 5 setup attempt returned HTTP 403: the current billing identity can list subscriptions but cannot create the product. No subscription was created or activated. The owner must create it in Play Console or grant the necessary product-management permission.

## Validation

- `tests/audio.integration.test.ts`: Storage and Firestore ownership, immutable
  originals, file validation, quota, moderation, library, purchases and refunds.
- `tests/music.integration.test.ts`: account binding, membership lifecycle,
  subscription gates, bounded listening, exact royalty allocation and reversals.
- Existing Play and payout integration suites remain applicable to shared changes.
- `tests/audio.browser.cjs`: actual MP3 decoding, seek/speed/resume, responsive
  themes, studio upload/review and mocked native subscription checkout.
- `tests/mobile-scroll.browser.cjs`: floating tabs, profile drawer, scrolling
  and rotation for browser/standalone/iOS/Android presentation signals.

References: [Google subscription lifecycle](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2),
[Google Play fees](https://support.google.com/googleplay/android-developer/answer/112622).
