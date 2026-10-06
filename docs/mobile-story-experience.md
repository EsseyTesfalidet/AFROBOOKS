# Mobile story experience

These additions apply only in the installed mobile app. The website keeps its existing discovery and library pages.

## Listen

- Readers can create up to 20 private playlists, with up to 100 audio titles in each.
- Audio titles can be added to a playlist, placed at the front of the queue with **Play next**, or added to the queue. Queue order can be changed and queued titles can be removed.
- Starting a playlist or queued title checks the normal audio playback endpoint. A playlist never grants access to a paid title; an unavailable or unpurchased title stays queued if playback is denied.
- The player has a 15, 30, or 60 minute sleep timer and an end-of-chapter/recording timer. The timer survives navigation while the player remains open and is cleared when the account changes.
- Swipe up on the compact player to expand it; pull the expanded player's top handle down to minimize it. Swipe the cover left to advance recordings or queued titles, and right to go back through recordings or the previous title. Title changes still use the authenticated playback endpoint; unavailable or unpurchased titles cannot be opened by swiping.

## Reader touch controls

In page mode, tap the left or right edge to turn a page, and tap the center to show or hide reader controls. Text selection, links, and buttons keep their normal behavior; scroll mode is unchanged.

## Read, Watch, Listen

- Language preferences rank matching releases first across book, video, and audio discovery. Other languages remain listed. Preferences are stored per account, with common aliases such as “Tigrina” matching Tigrinya.
- **Continue enjoying** combines in-progress reading, video, and audio in the mobile library. The server removes finished, refunded, inaccessible, removed, and unavailable titles before returning the shelf.
- **African story collections** group published books, videos, and audio around a subject. Each card links to the existing item page; its price and purchase/access checks remain unchanged.
- Admins create, reorder, publish, unpublish, and delete collections under **Admin → Story collections**. A published collection needs at least two titles in at least two formats, and every item must be published. Removing access or unpublishing a title removes it from the public collection view.

Downloads are not included in this release.

## Touch refresh

On mobile Browse, Watch, Listen, and the audio library, pull down from the top of the scroll area to refresh the current catalog. Horizontal shelves, video/audio players, links, and form controls do not start a refresh gesture. The indicator respects the app palette and reduced-motion setting.
