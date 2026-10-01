# Free samples and author preview settings

Text previews are controlled by each stored chapter's `isPreview === true` flag.
Legacy `previewPercentage` metadata is not used to cut a chapter into an excerpt.
A manuscript uploaded as a single chapter is therefore either fully public as a
preview or fully locked. Authors can split it into reading sections and select an
opening section as FREE PREVIEW. Saving/publishing applies that choice.

The publisher now shows the selected section count and explains both zero-preview
and all-sections-public configurations in Content, Pricing and the final checklist.
No existing published access flags are changed automatically.

Book details check preview availability using a server count of the same public
chapter query used by the reader, limited to one result. This avoids downloading
an entire chapter just to show a link. Desktop and mobile use the same result;
absence, loading and check failures are distinguished, with a retry for failures.
PDF issues do not advertise unsupported text previews.

`/sample/[id]` now opens a dedicated public-sample reader instead of redirecting
through the purchase-access route. It requests only preview chapters, even for
the author, an administrator or an existing purchaser. It does not reconcile
payments or write full-book reading progress. The reader still protects private
chapters, sanitizes text and supports pages, scrolling and text-flow preferences.
Preview chapters are fetched from the server to avoid an offline cached empty
result being presented as the current preview setting.

## Validation

- All 78 existing unit tests and TypeScript passed.
- Actual-component browser checks covered availability, no sample, PDFs, errors
  and retry, stale responses after navigating between books, publisher summaries,
  owner/admin preview isolation, no full-chapter fetches or full-book progress
  writes, page turns, missing books and unreleased books.
- The changed-file lint run has zero errors; the existing book/publish pages retain
  pre-existing warnings. New preview components and the availability hook are clean.

The live audit found **Nature Of Christ** with no preview chapter selected.
**ከንፈር ሄርሜላ** had been updated to 54 reading sections with one free preview.
These are author content settings, not a language or Stripe limitation.
