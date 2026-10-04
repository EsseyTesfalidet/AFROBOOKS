# Preview link navigation

The mobile report was that tapping **View full book** returned to an earlier reader page. The book-details destination remains `/book/{id}`; this change does not send readers directly to checkout.

The paginated reader previously recalculated its page whenever a child received focus. It used the first element rectangle and rounded its position down to a column. With fractional phone column widths, a link fractionally before a boundary could be assigned to the preceding column. Moving the link during pointer-down/focus prevented the ensuing click from activating it.

The reader now reveals controls on keyboard focus only. It selects a currently visible fragment when available and allows one pixel of rounding tolerance. Pointer focus leaves the current page alone. The purchase link also stays together within a column. Standard link navigation and book access checks are unchanged.

`tests/reader-preview-link.browser.cjs` exercises the real reader, app shell and preview link with generated Tigrinya text and mocked framework/data boundaries. Comparing against the reader from commit `b96482d`, a fractional alignment case reproduced the old failure: page index 7 became 6, and no book navigation occurred. The corrected reader passes pointer, touch and keyboard navigation, off-page keyboard focus, portrait/landscape, a large chapter, restored preview positions and scrolling in simulated Android/iOS app modes and browser mode. These are browser simulations, not physical-device tests.

Use `PLAYWRIGHT_PATH` and optionally `EDGE_PATH` for local browser tooling. The existing mobile reader browser suite and reader unit tests provide the surrounding navigation, positioning and content-access regression checks. No live account or book data is changed by these tests.
