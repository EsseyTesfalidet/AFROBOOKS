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
