# AfroBooks Screen: prepared integration

This adds the approved Screen design to the installed app's existing shell. It
uses the same navigation, themes, fonts, scrolling, touch feedback and account.
The ordinary mobile website keeps its existing reader navigation.

## Available in this change

- Installed app: Screen tab, wide video cards, category filters, title/creator/
  language search over loaded titles, paged catalog, creator channels, free
  follow, save, share, report, Library → Videos and resume progress.
- Streaming: Vidstack's touch player with signed Cloudflare HLS (over-video
  controls, subtitles, quality selection, fullscreen), optional trailers and progress
  saved about every 15 seconds, on pause, visibility change and navigation.
- Website: `/video-studio` for existing authors, creator applications, saved
  drafts, poster upload, private resumable video/trailer uploads, UTF-8 WebVTT
  captions (including `ti` for Tigrinya), processing checks and submission.
  Authors enter through Author studio → Videos; the mobile author handoff also
  lists video publishing among the available website tools.
- Administration: `/admin/videos` for creator approval/upload quotas, video and
  rights review, publication/unlisting/removal and viewer reports. Publication
  and creator decisions are recorded in `watchAudit`.
- Google Play one-time video purchases: native checkout, localized store prices,
  server verification, account-bound library access, restore, acknowledgement,
  authenticated notifications and refund reconciliation. Admin links each video
  to an immutable active Play product. Earnings use 80% creator / 20% AfroBooks
  after Google fees and taxes. Per-title activation requires a Console notification test.

No demo catalog, fake sales, credentials or actual video files are deployed.
Books and their Stripe fulfillment, fees and refund handlers are unchanged.

## Creator publishing workflow

Creators apply using their existing author account and wait for admin approval
and an upload allowance. They can search their catalog by title/language and
filter drafts, submissions, published and unlisted titles. Removed drafts and
creator-removed videos disappear from the studio immediately and stay hidden
after reloading. Removed titles are also hidden from the admin video list and
its filter counts. The underlying records remain for moderation and purchase
history; existing buyers retain access to creator-removed purchased videos. This is a
publishing editor for finished videos, not a timeline or automatic subtitle editor.

Draft saves reuse a stable ID when retrying a failed response, preventing a
second catalog entry if the first save reached the server. Unsaved edits trigger
a warning before closing the editor, following a same-tab link or leaving the
page. There is no background autosave. Save details before uploading files.

Main videos/clips and trailers have separate maximum-duration settings. One clip
is sufficient; no longer video is required. Custom covers are optional, with a
best-effort automatic frame generated after processing. The review
checklist requires saved details and a processed main video; an attached
trailer and any subtitle upload must also finish. Creators can return unpublished
submissions to draft themselves. Published details can be submitted as a private
revision for admin approval. Creators can remove their own videos from Screen;
published videos become unlisted so existing buyers keep access. Admin retains
publication, restoration and moderation controls. Paused creators retain read access to
their studio but cannot edit metadata, upload artwork/subtitles or reserve new
video uploads; those restrictions are checked on the server.

The creator now submits once after choosing a file and entering details. Upload
length is detected automatically, with manual entry available as a fallback.
Submissions enter `processing` while assets are prepared, then automatically move
to `in_review`. Studio polling and the existing scheduled worker perform these
checks; creators do not need to press a processing-status button. A preparing
submission can be returned to draft, and uploads must finish before closing the
browser. Admin publication remains a separate step.

Admin also checks pending video assets automatically while the page is visible,
retaining open review panels during refreshes. Previews distinguish a missing
file or unconfirmed upload reservation from Cloudflare's pending-upload, queued
and encoding states, and show encoding progress when available. Hosting and
checkout setup includes admin-only connection/storage checks and **Test upload
access**, which provisions an empty one-minute slot and immediately deletes it.
Explicit upload rejection (for example, invalid permissions) releases that failed
local reservation so retrying is possible. Timeouts and server errors retain it
until the provider allocation is verified; they must not create duplicate uploads.

See [the player and clip-upload notes](video-player.md) for playback behavior,
automatic-cover handling and validation coverage.

## Approving a video

Open **Admin → Videos** (`/admin/videos`) and select **Awaiting review**. Open a
video, watch the preview, check the rights declaration, then choose **Approve
and publish**. Use **Request changes** with a review note when corrections are
needed. Drafts must first be submitted by their creator; preparing videos become
eligible when processing completes. The disabled approval button explains what
is missing, with **Refresh status** available to recheck processing. Creator
access and hosting settings are below the review list. Paid videos still require
a connected, enabled Google Play product before checkout is available.

## Hosting setup

On October 4, the owner added the following variables to Vercel Production.
Their presence and sensitive/write-only type were verified; their values and
Cloudflare connectivity could not be read back or tested. No actual upload or
provider API request was made during that check. Required **server-only** variables:

```text
CLOUDFLARE_STREAM_ACCOUNT_ID=<32-character account ID>
CLOUDFLARE_STREAM_API_TOKEN=<account-scoped Stream edit token>
```

Do not prefix them with `NEXT_PUBLIC_`, place them in source control, or share
them in chat. Their presence enables upload and playback requests; the admin
page's "Configured" status checks presence/format, not provider connectivity.
An approved creator also needs an explicit upload-minute allowance.

Live diagnostics on October 4 verified that the configured account could be
read, but reported zero used minutes, zero storage capacity and zero videos.
The upload-access probe was rejected with HTTP 413 / code 10011. Stream storage
must be enabled on that same account before real uploads can be verified.
Local reservations from three failed allocations were reconciled only after
confirming the provider library was empty and no stored video assets existed;
the repair was recorded in `watchAudit`.

Uploads use Cloudflare direct-creator TUS URLs with `requiresignedurls`, an
expiry and server-reserved maximum duration. Large video bytes go directly to
Stream, not through a Vercel function. Processing is polled on request; there is
no Stream webhook to configure. Refresh processing status before submission.
All full videos and trailers require signed playback. No download token or MP4
download is issued. Signing is access control, not DRM: a token already issued
can remain usable until its expiry (1–4 hours depending on video duration).

Deploy `firestore.indexes.json` with the release and wait for the video catalog
index to finish building. Existing default-deny Firestore/Storage rules keep
Video collections server-only; even admin browsers cannot write entitlements
directly. The server uploads public poster images to `watch-posters/` with a
Firebase download token. Paid video bytes are never stored there.

## Costs and quota recovery

The creator allowance counts **reserved maximum minutes**, including trailers,
not only final runtime. Each file slot is reserved transactionally before a
provider request. A timeout or server failure does not automatically release its
allowance: the provider might have accepted a request whose response timed out.
Repeat requests reuse the same unexpired upload URL for the same size and
duration. Select the same file to resume within 24 hours.

After an expired/failed upload, a subtitle timeout, or a replacement request,
staff must check the asset in Cloudflare first. Confirm its status and ownership,
and ensure no approved video references it, before deleting/replacing an asset
or adjusting `watchPrivate` reservations and creator allowance. The initial UI
intentionally has no "reset quota" or unchecked replacement shortcut. Clear a
`captionsPending` flag only after confirming the provider operation has ended.
Unattached `watch-posters/` objects from failed/racing edits can be cleaned up
after checking that no `watchVideos.posterUrl` references them.

Check actual storage and delivery usage in Cloudflare. The reserved-minute
display is not an invoice or revenue calculation. First release is intended for
a small curated catalog; each creator can create up to 50 titles. Studio/admin
lists show up to 100 records; the mobile catalog loads 24 at a time. Library
shows 100 recent saved/watched records plus up to 100 active purchases. Extend
admin/library pagination before growing beyond these limits.

## Video checkout and earnings

Live and license-test one-time purchases are implemented. Before activating a title,
save the topic in Play Console and send its test notification, publish a processed
video from an approved creator, and connect an active Play product in admin.
See [Video Play Billing setup](video-play-billing.md).

Creators receive 80% and AfroBooks 20% of Google revenue after fees, taxes and
refunds. Creator/admin views show accrued earnings and provide reconciliation.
Google pays the platform. Monthly creator transfers are implemented through
verified Stripe funding; see [Monthly video payouts](video-payouts.md).
Subscriptions, Stripe video checkout and custom receipt emails are not implemented. Book subscriptions do not
unlock videos. Test purchases do not produce real earnings.

`watchEntitlements/{buyerId}/videos/{videoId}` is server-only. Only `status: active`
grants purchased access. Verified Google purchases create these records
transactionally, together with a private purchase record and saved-library entry.
Restore and authenticated notifications reconcile Google status; full playback
also rechecks Google before issuing a new Stream token. Existing signed playback
tokens can remain usable until their expiry. Refunds revoke the matching purchase
without revoking a later repurchase. Browser clients cannot write these records.

Before opening paid releases to readers:

1. Video earnings use the approved 80% creator / 20% platform split after Google's
   fees and taxes. Book commission settings are unchanged. Review actual hosting
   costs when setting video prices.
2. Complete the version-3 update in the existing closed testing track and real-device license tests for the video
   purchase flow. Select permitted distribution markets and review pricing in
   each. The separate ebook Stripe release gap is still unresolved.
3. Exercise purchases, acknowledgement recovery, refund/revoke and repurchase on
   Google. Automated tests simulate these flows; they do not establish real-device
   payment or playback success.
4. Follow [monthly video payouts](video-payouts.md) after Google settles: add funds
   to Stripe and register the verified top-up in Admin > Videos. Reconciliation,
   creator earnings, transfer receipts and signed notifications are implemented.
5. Finalize rights evidence, takedown and paid availability/refund policies before
   accepting paid content. One-time access is not an unconditional lifetime
   hosting promise. Creator subscriptions are a later phase.

## Validation and release

```powershell
npm.cmd run test:watch
# Set PLAYWRIGHT_PATH / EDGE_PATH if using the workspace's local browser tools.
node tests/watch.browser.cjs
npm.cmd test
npm.cmd run build
```

Integration tests use a local Firestore emulator and simulated Cloudflare/Google
responses, including ambiguous upload failure, quota concurrency, review locks,
private/public access, revoked entitlement, captions, duplicate draft retries,
paused creator writes and direct-client denial. Play cases cover account/product
spoofing, duplicate grants, pending purchases, acknowledgement retries, recovery,
refunds and repurchase ordering. Unit/regression tests: 125 passed. Firestore
integration tests: 26 passed.
Browser tests render the real app shell, header, Screen UI and creator/admin
pages with API/player/upload fixtures. They cover light/dark, small
portrait/landscape, app-only presentation,
Tigrinya search, paid gate, trailer isolation, saved library, resume, reports and
retry. The creator flow covers application/approval, failed-save recovery,
unsaved edits, catalog filters, separate upload limits, Tigrinya captions,
submission, review corrections, publication and paused access. These tests do
**not** establish real hosting or native Android playback. Browser Play tests use
simulated Digital Goods and Payment Request responses; they cover localized
prices, account binding, pending access and restore after an interrupted return.
The signed version-3 bundle builds and validates, but a physical Play test is
still required.

The dependency audit still reports eight pre-existing high-severity findings in
unchanged dependencies. The new packages introduced no additional audit
findings. Targeted lint has no errors; four existing-style plain-image warnings
remain in the new views. This change is not a full security audit of the app.

After connecting hosting, validate a real short free video and separate trailer
with Tigrinya subtitles on the installed Android app before opening uploads more
widely. Test weak connection/resume, rotation, fullscreen, captions and removal.
The owner authorized deployment and was notified before it started. No paid hosting
account was provisioned by this work.

## Production release

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


Primary references:
- [Cloudflare direct creator uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/)
- [Cloudflare signed playback](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/)
- [Cloudflare React player](https://github.com/cloudflare/stream-react)
- [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)

The live authenticated Pub/Sub infrastructure probe was delivered successfully
and recorded by the production endpoint. This verifies the push subscription,
OIDC authentication and server/database access. The Play Console test was also
received successfully; neither test created a purchase or earnings record.

## Finding Creator Studio

Screen and the mobile author page now link to Creator Studio. The fixed website
handoff opens Chrome on Android, preserves the video destination through sign-in
and author setup, and retains the existing Back to app control. The editor remains
at `/video-studio`; creators apply there and uploads require admin approval.

The final October 4 website update is `dpl_5663N9NPRbjMyEXUpv292o3vaWeK`, READY
and aliased to afrobs.com. It also centers Explore Screen below the empty-library
message and fixes the double search focus border. See
[billing release verification](video-play-billing.md#final-website-update-october-4)
for current test results and the remaining native release permission blocker.
