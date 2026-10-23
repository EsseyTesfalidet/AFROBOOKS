# Creator playlists and series

Authors open **Playlists & series** from the dashboard, Books, Video Studio, or Audio Studio. The editor is at `/creator-playlists` and supports up to 20 playlists with 30 titles each. A list can contain books, videos, audio, or a mixture of formats.

Creators can save empty private drafts, add their own published releases, arrange titles, publish, unpublish, and delete the grouping. Deleting a playlist preserves its releases and purchases. Switching accounts clears unfinished editor state.

Published lists appear on `/author/[id]` and the installed app's video creator channel. Each item opens its existing detail page. Grouping titles grants no reading, video, audio, or subscription entitlement, and does not provide continuous playback.

All mutations use the authenticated, same-origin experience API. A Firestore transaction checks ownership, current title publication/readiness, and the creator's playlist quota before writing. Creators cannot directly read or write the playlist or quota collections from the browser. Public reads expose published metadata only, hide removed or unpublished titles, omit empty lists, and hide suspended creators.

Verification:

- `npm test` runs the unit suite.
- `npm run test:experience` runs Firestore integration checks in the demo emulator project, including drafts, cross-account access, publication, deletion, concurrent quota enforcement, and conflicting playlist IDs.
- `node tests/creator-playlists.browser.cjs` checks the real editor and audience shelves with synthetic API records. Set `PLAYWRIGHT_PATH` and, when needed, `EDGE_PATH` as with the existing browser suites.
- `node tests/watch-player.browser.cjs` covers the video player and the suppressed poster during detail playback startup.

These browser and emulator checks do not create production publications, accounts, payments, or uploads.
