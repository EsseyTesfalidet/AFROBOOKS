# Screen player and clip uploads

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
- When a creator checks processing or submits a ready draft without artwork, the server attempts to extract a frame from the signed main video and saves it as public cover artwork in Firebase Storage. No video playback token is included in the saved cover URL.
- A concurrent custom cover takes precedence. If frame generation fails, the processing check explains how to retry or upload artwork; it does not block submission. The catalog uses its existing film icon until artwork is available.
- A processed main video, rights declaration, creator approval and administrator review remain required. A trailer alone is insufficient. Paid clips use the same purchase authorization as films.

## Creator edits and removal

Creators can return their unpublished preparing/review submissions to draft, edit the details and submit again. Published and unlisted videos have an **Edit details** action for title, description, category, language, price, news date and rights. These changes are stored privately as one pending revision; the current listing and video remain available until an administrator approves the exact revision. Creators can withdraw pending changes. Admins see current/requested values and can approve or reject with a note. This edits the listing, not the video timeline or the already-purchased media file.

An approved price change disables new Google Play checkout in both the private video settings and the product mapping. Admin must align the Play Console price and re-enable checkout. Existing entitlements, earnings and video assets remain intact. Revisions never change publication status or republish an unlisted video.

**Remove from Screen** unlists a previously published video: it disappears from discovery and new checkout, but existing buyers keep library access. Removing an unpublished video moves it to Removed and cancels its submission. Removal cancels pending revisions, does not delete media/purchase/earnings records, and does not refund reserved hosting minutes. Only the owning creator can use these controls; admin removals cannot be downgraded by creator actions. Restoration requires admin review. All revision decisions and removals have audit records.

## Validation

`npm test` covers resume ordering, account/trailer isolation and bounded signed-thumbnail requests. `npm run test:watch` uses local Firestore and Storage emulators with a fake hosting provider to check access, billing/payout behavior, clip publication without optional files, automatic-cover persistence and custom-cover precedence.

`tests/watch.browser.cjs` checks the integrated creator/viewer/admin workflows with mocked external services. `tests/watch-player.browser.cjs` exercises the real media library and HLS decoder in Edge using Vidstack's public test film, with synthetic Tigrinya captions: play/pause, seeking, speed, quality, captions, fullscreen, rotation, retry and account switching. It requires `PLAYWRIGHT_PATH` and `EDGE_PATH`. Physical-device picture-in-picture and the production hosting account are not covered by these browser fixtures.
