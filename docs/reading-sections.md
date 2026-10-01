# Manuscripts without chapter headings

New imports default to **Suggest reading sections** when the manuscript has no
recognized chapter headings. Authors can choose approximately 750, 1,500 or 3,000
words per section, or **Keep one section**. Existing recognized headings (including
Tigrinya and Arabic) always take precedence. Suggestions are reviewed in the
existing import preview; no chapters are changed until **Use these chapters**.

For a book already imported as one chapter, open **My books → Edit → Book Content**
and select **Split into reading sections**. Review the proposed sections, then
select **Use these sections**. This changes the local editing draft only. The
existing save/publish flow updates the stored book after author review. The
generated titles are **Reading section 1**, **Reading section 2**, etc.; authors
can rename them using the existing chapter editor. These are reading divisions,
not inferred story chapters, and do not call an AI service.

Splitting occurs between complete HTML blocks. Paragraphs, headings with their
following block, lists, quotations, intentional verse and inline formatting stay
intact. Concatenating the generated content exactly reproduces the source HTML.
A very small final section is combined with the preceding one. A single huge
paragraph/list stays intact with guidance to add paragraph breaks in the editor.
Section lengths are approximate. At most 200 generated sections are supported.
Word estimates support languages with and without spaces.

Only the first generated section inherits free-preview access; a locked source
stays locked throughout. The author can review preview flags before saving.
Structural changes to an existing book can move readers' saved positions; the
preview explains this. No published books or reading-progress records are
automatically rewritten. New sections use the existing reader's chapter menu,
page navigation and progress saving.

## Validation

- 75 unit tests passed, including lossless splitting, paragraph/list/verse safety,
  heading priority, opt-out, locked previews, malformed HTML, oversized paragraphs
  and Tigrinya/Arabic/Chinese text.
- An actual-component browser workflow verified empty publishing state, import
  suggestions/discard/opt-out, existing-chapter preview/cancel/apply, exact HTML
  preservation, preview flags, reader contents, page turns and saved section
  progress. Chapter/account data were fixtures; no live book was published in tests.
