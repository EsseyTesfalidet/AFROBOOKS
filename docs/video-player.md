# Screen player and clip uploads

## Optional cover photos

The main upload form accepts an optional PNG, JPG or WebP cover up to 3 MB,
including before the first draft save. It previews the selected file and lets
creators discard that selection. The cover uploads with Save draft or Submit;
skipping it retains existing artwork or allows automatic frame generation.

Published/unlisted videos can submit a replacement cover with Edit details.
The server stages uploaded artwork under the video and accepts its generated ID
with a revision, never a client-supplied URL. Reviewers see current and requested
images. Only approval replaces the public cover; rejection keeps the current
artwork and all existing video access intact.

## Screen discovery

The installed app feed previews one centered, mostly visible card after a short
scroll pause. Previews are muted, play for up to 20 seconds, do not write watch
history, and stop when leaving the viewport or opening Profile. They respect
reduced motion, supported Data Saver settings, slow connections, offline state
and tab visibility. Readers can switch previews off. Preview tokens are cached
only within the current account's mounted feed and normal paid access checks
still apply: a separate trailer is preferred; full video requires access.

Opening a video requests playback immediately, using the full video for readers
with access or a trailer otherwise. Browser autoplay restrictions can require
one tap on Play. Creator/admin review players retain manual playback. Related
published videos appear below the description, ranked by creator, category and
language from a bounded set of up to 100 catalog entries. Creator Studio is in
the installed app Profile, using the existing website handoff and return flow.

Reference: [Vidstack autoplay](https://vidstack.io/docs/player/api/autoplay/).

The installed app's Screen player uses Vidstack with locally bundled hls.js to play Cloudflare Stream's signed HLS source. Controls sit over the video: central play/pause, 10-second skips, touch double-tap seeking, timeline scrubbing, fullscreen, and picture in picture where supported. The settings menu offers playback speed, available quality levels and available caption tracks. Videos retain their aspect ratio. Controls remain consistent when rotating the phone, with reduced-motion support.

Playback still requires the existing server authorization. Retry requests a fresh signed token and checks access again. Changing accounts removes the old player. Resume writes are serialized and throttled, with forced saves on pause/seek and best-effort saves when leaving. Trailers do not overwrite the main video's progress. Signing is access control, not DRM; already-issued tokens remain valid until expiry.

Admins have a full-width Video preview panel above each submission's review controls. Creators have the same panel near the top of their editor, including for unpublished videos. Both use the shared player with the title, cover and a separate optional trailer preview. Unready media shows a preparation message. Preview sessions start at the beginning and do not save viewing progress. Closing a preview or its containing review/trailer section stops playback. Existing server authorization allows only the creator and admins to preview unpublished media; adding these panels does not make it public.

## Creator uploads

- Select or drag in a video, preview it locally, fill in the details and press **Submit**. Duration is detected from local metadata and rounded up for the existing upload allowance. A manual duration fallback lives under Upload options. Music uses the same flow.
- Save draft remains available. Optional artwork, trailers and subtitle controls appear inside a collapsed section on saved drafts.
- Submit uploads the selected file, then durably sets `processing` before checking the hosting provider. The screen shows Uploading → Preparing → Awaiting review → Published. Pending submission responses can be retried without re-uploading or editing an already-submitted record.
- While the studio is open, it checks one pending asset every 12 seconds, preserving unsaved fields. The existing authenticated 15-minute scheduled job also checks a leased, cursor-based batch of three queued submissions in parallel. This continues after the tab closes; larger queues may take additional runs. Only ready submissions with current creator approval and an eligible user account advance to review. Publication still requires admin approval. Preparing submissions can be returned to draft.
- Upload a film or clip under **Main video or clip**. A clip does not need a longer version.
- A separate trailer and a custom cover are optional.
- Ready videos without artwork receive a frame from 10% into the main video (capped at 30 seconds to look past opening fades), saved permanently as public artwork in Firebase Storage. No video playback token is included in the image URL. Custom covers, including concurrently uploaded ones, take precedence.
- Thumbnail retries continue after review and publication: processing/admin refresh, visible cards and the authenticated 15-minute job can repair missing images. The job rotates through three missing covers per run; a per-video lease and failure cooldown avoid duplicate provider work. The catalog, related videos and library keep the still image underneath autoplay; paid videos also show artwork without granting playback access. While an image is initially unavailable, visible cards request it again for up to two minutes. A provider outage does not block submission or playback.
- A processed main video, rights declaration, creator approval and administrator review remain required. A trailer alone is insufficient. Paid clips use the same purchase authorization as films.

## Creator edits and removal

Creators can return their unpublished preparing/review submissions to draft, edit the details and submit again. Published and unlisted videos have an **Edit details** action for title, description, category, language, price, news date and rights. These changes are stored privately as one pending revision; the current listing and video remain available until an administrator approves the exact revision. Creators can withdraw pending changes. Admins see current/requested values and can approve or reject with a note. This edits the listing, not the video timeline or the already-purchased media file.

An approved price change disables new Google Play checkout in both the private video settings and the product mapping. Admin must align the Play Console price and re-enable checkout. Existing entitlements, earnings and video assets remain intact. Revisions never change publication status or republish an unlisted video.

**Remove from Screen** unlists a previously published video: it disappears from discovery and new checkout, but existing buyers keep library access. Removing an unpublished video moves it to Removed and cancels its submission. Removal cancels pending revisions, does not delete media/purchase/earnings records, and does not refund reserved hosting minutes. Only the owning creator can use these controls; admin removals cannot be downgraded by creator actions. Restoration requires admin review. All revision decisions and removals have audit records.

## Validation

`npm test` covers resume ordering, account/trailer isolation and bounded signed-thumbnail requests. `npm run test:watch` uses local Firestore and Storage emulators with a fake hosting provider to check access, billing/payout behavior, clip publication without optional files, automatic-cover persistence and custom-cover precedence.

`tests/watch.browser.cjs` checks the integrated creator/viewer/admin workflows with mocked external services. `tests/watch-player.browser.cjs` exercises the real media library and HLS decoder in Edge using Vidstack's public test film, with synthetic Tigrinya captions: play/pause, seeking, speed, quality, captions, fullscreen, rotation, retry and account switching. It requires `PLAYWRIGHT_PATH` and `EDGE_PATH`. Physical-device picture-in-picture and the production hosting account are not covered by these browser fixtures.
