# Reader release — 26 September 2026

The reader now uses a quiet page layout with Back, Chapters and Appearance controls. A chapter list replaces the previous duplicate navigation and chapter dots. Appearance includes four page colors, two typefaces, text size, line spacing and margins. Mobile settings use a bottom sheet; keyboard focus, Escape and text selection are preserved.

Reading positions use a paragraph anchor with a scroll-fraction fallback. Position restoration covers changed typography, viewport rotation and reopening the book. Device storage provides recovery when account sync fails; cloud writes are serialized and an older failed write cannot replace a later position. Preview and full-book positions are separate, and previews never overwrite paid reading progress. Removed catalog books also leave the device position cache.

The purchase prompt appears only after the last available sample chapter. Preview queries only request allowed sample chapters. Finishing an early chapter or a preview does not mark the full book finished.

## Manuscript repair

Two original manuscripts used Windows-1252. The old importer read them as UTF-8, losing 8,442 characters across 51 chapters. The originals remained available in private storage and their old imports matched the stored chapters exactly.

- **ECHOES OF AFRICA: Reclaiming the Soul of Civilization:** 30 chapters restored.
- **EPISTEMIC APARTHEID: How Eurocentric Scholarship Rewrote Africa's Past:** 21 chapters restored.

The repair reconstructs content from the original bytes. It preserves chapter IDs, preview access and custom titles, refuses content edited since import, checks concurrent changes, saves private local backups and writes an administrative repair receipt. A second dry run confirmed zero remaining changes. Original archives are preserved. Private backups and test artifacts are excluded from Git and Vercel uploads.

New uploads support UTF-8, marked UTF-16 in either byte order, and legacy Windows-1252. Decoding applies the [WHATWG Windows-1252 mapping](https://encoding.spec.whatwg.org/index-windows-1252.txt) consistently across browser and Node runtimes. Already-damaged characters, malformed marked Unicode and binary controls produce an actionable import error instead of being published silently.

The repair command is dry-run by default and requires each target explicitly:

```text
node --env-file=.env.local --import tsx scripts/repair-manuscript-encoding.ts --book BOOK_ID
```

Add `--apply` only after reviewing the dry run. Repairs run transactionally per book and are repeatable.

## Validation

- 16 automated tests pass, including multilingual imports, encoding failures, repair safeguards and reading-position isolation.
- Eight browser scenarios pass for import encoding, accessible dialogs, passage restoration, keyboard navigation, preview access, connection recovery, blocked device storage and overlapping failed saves.
- Actual repaired Firebase previews load in the production build on mobile and desktop, with no replacement characters or browser exceptions.
- Production build and TypeScript pass. Lint reports no errors or warnings in the changed reader, publishing, repair and test files.

Signed-in cloud failure scenarios use simulated responses; no real purchases were made during these checks.
