# AfroBooks Listen

Mobile navigation is Browse, Screen, Listen, Library. Account stays behind the
header profile picture; the floating dock and selected-icon lift are preserved.
Desktop bookstore navigation is unchanged. Creators use `/audio-studio`, linked
from their profile and author navigation. Admin reviews audio at `/admin/audio`.

## Audio publishing and listening

Creators upload Music, Podcasts or Audiobooks as MP3 files, up to 250 MB each,
with 20 active uploads per creator. Titles, descriptions and language names are
Unicode, including Tigrinya. Each title supports a first recording plus up to 49
additional tracks, episodes or audiobook parts (1 GB and 48 hours combined).
Files play in upload order. A title's single purchase unlocks all its recordings.
Optional chapter markers name positions across the combined timeline, starting
at 0:00. Enter increasing times as minutes:seconds or hours:minutes:seconds.

Uploads go directly to Firebase Storage with resumable progress and cancellation.
Only the owner of a server-created draft can create its original file. Finalizing
validates size, MIME and MP3 signature, copies to an immutable, server-only object
without Firebase download tokens, removes the staging file, and marks it ready.
The full recording is not transcoded. A completed upload can be recovered after
a connection failure by selecting the same file and saving again. Additional
recordings have size-bound, idempotent reservations; unfinished parts can be
reselected or removed. Published parts with checkout configured cannot be deleted.

Saving prepares a separate MP3 sample containing up to the first 60 seconds of
the first recording. The server reads at most 4 MB of audio after ID3 metadata,
decodes bounded chunks with `mpg123-decoder`, and encodes the sample with LAME.
The decoder remains a server external package for its optional worker loader.
A lease prevents duplicate generation; a failed sample leaves the full upload
saved for retry. Existing titles have **Prepare free sample** in the studio/admin.
Sample playback signs only the sample object for 15 minutes, without an
entitlement, progress update or music royalty session. Full playback still
requires the title purchase or music subscription.

Cover art is optional: JPG, PNG or WebP, up to 3 MB and 24 megapixels. Server-side
decoding strips metadata and creates a WebP up to 1200 pixels. Covers are public;
audio objects remain private. Missing or failed images use category artwork.

The creator previews and submits; admin previews and approves or returns it with
feedback. Editing published metadata requires withdrawal and another review.
Removal hides records and deletes files; titles with checkout mappings or
purchases must instead be withdrawn so existing buyers retain access.

The mobile player provides play/pause, seeking, 15-second skips, speed, volume,
global resume, chapter selection, next/previous recordings and automatic
continuation. Its mini-player persists across buyer pages. Expanded artwork
grows during playback; a cover-colored background blends with AfroBooks accents.
The player shares the floating dock’s width and safe-area spacing, measures its
height, and fits above it even with larger text or after rotation. Now Playing
uses a single main transport, larger artwork, the current recording title and
a compact two-column landscape layout. Chapters and Up next remain scrollable.
Sound bars and the current Up next indicator animate with playback state (they
are decorative indicators, not a measured waveform). Reduced-motion preferences
disable animation. Devices that reject software volume changes show a device
volume hint. Website studio button adjustments exclude installed-app mode.
The player stops for sign-out/account changes,
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

- `tests/audio-sample.test.ts`: real MP3 encoding/decoding, the 60-second cutoff,
  short and invalid recordings, Unicode chapter times and part boundaries.
- `tests/audio.integration.test.ts`: Storage and Firestore ownership, immutable
  originals, bounded part reservations, isolated samples, cover sanitization,
  quota, moderation, combined timelines, library, purchases and refunds.
- `tests/music.integration.test.ts`: account binding, membership lifecycle,
  subscription gates, bounded listening, exact royalty allocation and reversals.
- Existing Play and payout integration suites remain applicable to shared changes.
- `tests/audio.browser.cjs`: actual MP3 decoding, sample isolation, automatic
  next-part playback, seek/speed/volume, covers, reduced motion, responsive themes,
  studio uploads, desktop buttons and mocked native subscription checkout.
- `tests/mobile-scroll.browser.cjs`: floating tabs, profile drawer, scrolling
  and rotation for browser/standalone/iOS/Android presentation signals.

References: [Google subscription lifecycle](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2),
[Google Play fees](https://support.google.com/googleplay/android-developer/answer/112622).
