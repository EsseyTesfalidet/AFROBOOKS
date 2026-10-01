# Page and scroll reading modes

Readers can use the book icon in the toolbar or **Reading appearance → Reading
mode → Pages** to turn pages. **Scroll** restores continuous scrolling. The choice
is saved on the device. Existing readers keep their scrolling preference until
they choose Pages.

Pages reflow to the available screen size and current typography. Previous/Next
buttons and horizontal swipes turn pages; arrow keys, Page Up/Down and Space also
work when the reading area has focus. Shift+Space goes back. The page counter is
per chapter and changes when the layout changes. Chapter boundaries advance to
the next chapter or return to the previous chapter's final page.

Reading positions retain paragraph anchors across mode changes, typography,
rotation and reopening. Paragraph fragments are measured separately when a long
paragraph spans columns. Fractional column widths avoid accumulated clipping on
phones. Text remains selectable; keyboard navigation does not interrupt a text
selection. Preview access, cloud-save retry and separate preview positions are
preserved. This updates the text reader; magazine PDFs retain their existing
page controls.

## Validation

- All 62 existing unit tests passed; an additional regression covers accumulated
  page drift at fractional phone widths.
- Actual-component browser checks passed for page buttons, keyboard navigation,
  touch swipes, chapter boundaries, font/viewport changes, saved page restoration,
  switching modes and preview restrictions.
- All eight existing scrolling-reader browser scenarios passed, including failed
  cloud saves, blocked storage, load retries and concurrent save ordering.
- All 30 long Tigrinya paragraphs and all 30 right-to-left Arabic paragraphs were
  reachable through page turns without vertical clipping. Short landscape error
  screens retained an accessible retry button.
- Browser checks used Chromium/Edge with mobile, portrait and landscape viewports;
  account and chapter responses were fixtures. Native Safari was not exercised.

## Release — October 1, 2026

- Code commit `a3f1ff4` deployed as `dpl_GnvR3s1JbDZ2P7VjpNdbRQEw32CV`
  and promoted to `afrobs.com`. Production build, TypeScript and changed-file lint
  passed. The additional page-width regression passed with all five reader tests.
- The deployed build passed browser checks against an actual Firebase book
  preview: page controls, saved-page reopening, rotation and switching to scroll,
  with no browser exceptions. Deployment protection was accessed using the
  authenticated Vercel CLI; no reader access checks were bypassed.
- The final browser check on the public domain was blocked by this workspace's
  DNSFilter interception (its certificate was issued by `DNSFilter Root CA`).
  The public site remained accessible through the separate web fetch service.
  No certificate validation or network filtering was disabled.

## Mobile width correction — October 1, 2026

Long book titles could give the paged reader's implicit grid column a minimum
width wider than the phone. This affected **Epistemic Apartheid: How Eurocentric
Scholarship Rewrote Africa's Past**: on a 390px phone, the reading viewport grew
to about 604px, taking text and toolbar/page controls beyond the screen edge.

The page grid now has an explicit `minmax(0, 1fr)` column, and its toolbar,
viewport and progress bar can shrink inside that column. Long title text uses
the existing toolbar ellipsis. Scrolling mode and stored manuscripts are unchanged.

Browser checks used a read-only snapshot of all 21 chapters with the actual
reader and app styles at 320×568, 375×667, 390×844 and 844×390, with medium and
largest text sizes. All 168 combinations passed viewport and text-fragment
boundary checks; the original layout failed all 126 portrait combinations.
Tigrinya and Arabic page-reader checks also passed, with all 30 paragraphs in
each fixture reachable. No published chapter or purchase data was changed.
