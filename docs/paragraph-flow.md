# Paragraph flow in imports and reading

New PDF, OCR, TXT and Markdown imports default to **Flow as paragraphs**. Single
wrapped lines join with spaces; blank lines delimit paragraphs. Adjacent CJK
characters join without inserting word spaces. Headings still delimit chapters;
bulleted/numbered items stay separate lists. Markdown's explicit two-space or
backslash line breaks are retained. Wide regular PDF line spacing is learned
from repeated baselines so it does not become a paragraph break on every line.
PDF/OCR structure still requires the author's existing preview and review.

**Manuscript text layout → Keep original lines** retains verse/stanza formatting.
An allowlisted paragraph attribute carries that choice through sanitizing,
editing, saving and reading. Shift+Enter in the editor marks intentional breaks.
The older encoding repair command explicitly uses the legacy importer so an
encoding-only repair cannot also reformat a published manuscript.

Published chapters are not rewritten. The reader's **Text flow** setting offers:

- **Automatic** (default): join clearly wrapped, long lines within existing
  paragraphs. Short or ambiguous lines, Poetry books, code, headings, list items
  and author-marked line breaks retain their layout.
- **Flow as paragraphs**: join other single line breaks within existing prose
  paragraphs. Author-marked breaks and repeated blank separators remain.
- **Keep original lines**: show the original sanitized chapter layout.

The setting is saved on the device and works with Pages and Scroll. Paragraph
boundaries are never merged, keeping paragraph anchors available for position
restoration. Already imported text with a separate paragraph for every line needs
author review/reimport; the reader does not guess which distinct paragraphs belong
together. Automatic detection is conservative, not a guarantee of author intent.

## Validation

- Unit regressions cover soft wrapping, whitespace-only paragraph separators,
  emphasis spanning lines, verse, explicit breaks, lists, multilingual words,
  HTML escaping, adaptive PDF spacing and legacy encoding-repair compatibility.
- Actual-component browser checks cover upload previews, both import layouts,
  editor save/Shift+Enter, automatic reading reflow, original-line switching,
  unchanged words and paragraph counts, reading position, persistence and rotation.
- Existing page-reader and scrolling-reader browser scenarios are rerun. Browser
  coverage uses Chromium/Edge; native Safari is not exercised.

## Release — October 1, 2026

- Commit `dfb30a9` is deployed as `dpl_8wiZQzTE4nYCNXdZJPM8xVDHcMNk` and
  promoted to `afrobs.com`; the domain alias was verified directly with Vercel.
- All 70 unit tests, TypeScript, changed-file lint and the production build passed.
  Author/reader flow browser tests, page-reader regressions and all eight existing
  scrolling-reader scenarios passed.
- A read-only audit of seven published books (70 chapters) confirmed unchanged
  non-whitespace text and paragraph counts. Automatic display reflow removes 2,828
  clearly wrapped line breaks. No stored manuscript or chapter was modified.
- On an actual deployed Firebase preview, the original 37 line breaks became 30
  in Automatic and zero in Paragraphs, while all 11 paragraph blocks and text were
  retained. Switching back, page turns, saved position/preference and rotation
  passed without browser exceptions. This used the authenticated deployment URL;
  this workspace's public-domain DNSFilter limitation remains as documented in
  `reader-pages.md`.
