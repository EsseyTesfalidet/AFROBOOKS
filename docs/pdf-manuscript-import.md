# PDF to editable chapters

In Publish → Book Content, authors can upload a PDF with selectable text alongside the existing `.txt` and `.md` formats. PDF.js extracts text locally in the browser. Authors review all extracted chapters and warnings, then choose **Use these chapters** before the existing chapter list changes. Discarding or failing an import preserves existing chapters. The ordinary chapter editor remains available before saving or publishing.

Text PDF imports accept up to 20 MiB, 500 pages and two million extracted characters, with a two-minute conversion timeout. The converted UTF-8 `.txt` manuscript is saved through the existing private manuscript storage path; the original PDF is not uploaded. No paid conversion or AI service is called. This is separate from the illustrated magazine PDF viewer, which retains the original PDF and its page layouts.

## Scanned PDF / OCR

Authors can choose **Scanned PDF / OCR** and select English, Tigrinya, Amharic, Arabic, French, Swahili, Yoruba, Portuguese or simplified Chinese. The initial language follows the publication language where supported. OCR renders each PDF page to a temporary canvas, recognizes it with Tesseract.js, and sends the result through the same safe chapter parser and review step. Recognition stays in the browser and does not send manuscripts to an external OCR service. Static tool/model downloads still consume normal hosting bandwidth.

OCR accepts up to 20 MiB / 50 pages per import, processes one page at a time, caps rendered pages at four million pixels, and times out after ten minutes. Progress and cancellation are available; cancellation, failures and discarding the preview preserve existing chapters. Authors must review all recognized text; low-confidence pages and pages without recognized text are flagged. No confidence score guarantees accuracy. Use clear, upright printed pages; handwriting, mixed languages, poor scans and complex layouts may require manual correction.

The build copies workers, WebAssembly cores and licenses from the installed packages into ignored `public/ocr`. Nine compressed models are committed under `public/ocr-models`, pinned to Tesseract `tessdata_fast` 4.1.0 commit `65727574dfcd264acbb0c3e07860e4e9e9b22185`. Its Apache license and an asset/hash manifest are included. Only the selected language model is requested, with browser caching.

The application owns the OCR browser worker immediately and sends its initialization/recognition messages directly. This permits cancellation during startup and handles language-download failures that can leave the upstream SDK's initialization promise pending. The worker protocol is pinned to Tesseract.js 7.0.0; the asset preparation script rejects unreviewed version changes. Retest initialization, recognition, cancellation and failed asset/model downloads when upgrading. OCR assets/models are excluded from PWA precaching to avoid downloading all languages for every visitor.

## Languages

Unicode text remains in its original language; conversion does not translate it. Tigrinya (ትግርኛ) is explicitly supported and available in publishing and catalog search. `ምዕራፍ 1` / `ምዕራፍ ፩` headings split Tigrinya and Amharic chapters. Arabic `الفصل` and `فصل` headings also split chapters. English chapter headings and Markdown headings retain their existing behavior. Other text without recognized headings becomes one editable reading section.

Previews, chapter editing and reading select text direction automatically. A self-hosted Noto Sans Ethiopic font covers Tigrinya/Amharic text in previews, editing and reading without relying on device fonts; its SIL Open Font License is included in `public/fonts`. PDF font character maps determine extraction quality. Some PDFs store Arabic presentation glyphs in visual order; these receive an explicit warning to compare the preview or export UTF-8 text from the source document. Automatic conversion cannot guarantee correct reading order for every font or multi-column layout.

## Limitations

Images, tables, styling and fixed page designs are not recreated in the chapter editor. Headers, page numbers and column order need author review. Text mode directs image-only PDFs to the OCR option. Mixed PDFs report pages without extractable text. Password-protected, invalid and oversized PDFs show actionable errors. Damaged replacement characters are rejected.

## Verification

54 unit tests passed, including localized heading detection, Ethiopic numerals, Unicode preservation, right-to-left fragments, escaped markup, upload limits, OCR language validation and cancellation. Browser checks passed in Chromium (Edge), Firefox and Playwright WebKit using real generated PDFs containing Tigrinya, Amharic, Chinese and French; verified Tigrinya editing and UTF-8 output; exercised the Arabic presentation-glyph warning and right-to-left Arabic text imports; and checked review/discard/replacement, scanned/corrupt/mixed files, Markdown regression and mobile layouts. Actual OCR recognized both English and Tigrinya image-only PDFs, including `ሰላም ዓለም` and `ትግርኛ`. Cancellation, failed model downloads and the 50-page OCR limit preserved the previous accepted manuscript. WebKit testing is not a physical iPhone test. Existing publication/payment integration coverage is unchanged by this client import feature.
