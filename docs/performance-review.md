# Performance review — September 30, 2026

Security release: `e339db2`, deployed to https://afrobs.com. This review identifies the next performance changes; it does not implement pagination or claim a measured speed improvement.

October 1 follow-up: removed the duplicate full-catalog fetch; the shared live
listener now handles results/errors, with a 15-second initial timeout and retry.
Converted DM Sans, Manrope and Noto Sans Ethiopic to WOFF2 without subsetting:
1,548,032 bytes of original files become 539,600 bytes, with identical Unicode
coverage and glyph widths. Regenerate with `scripts/compress-fonts.py` and
FontTools/Brotli. Reader typography and the existing Google-font families remain
unchanged. Pagination, cover variants and layout-shift tuning below are still
future work; no new measured LCP/CLS improvement is claimed.

One fresh Chromium visit to `/browse`, 390 × 844 viewport, on an unthrottled development machine recorded approximately 1.26 s LCP, 0.234 cumulative layout shift, 39 resource requests and 1.08 MB of same-origin transferred resources. These are a single lab sample, not representative mobile or real-user percentiles. Cross-origin transfer sizes may be unavailable. The page had no horizontal overflow or JavaScript exceptions.

Priorities:

1. `subscribeLiveBooks` starts a realtime listener and a separate `getLiveBooks()` query for the full live catalog. Remove the duplicate fetch while retaining error handling, then paginate the catalog with Firestore cursors. Search and genre filters need server-side behavior so pagination cannot silently hide matching titles.
2. The sampled font transfers totaled about 696 KB: Ethiopic 518 KB, DM Sans 109 KB and Manrope 70 KB. Convert the self-hosted fonts to WOFF2 and retain the Ethiopic Unicode coverage and font licenses. Audit the old Google Fonts import before removing it because the book reader still uses Lora and manuscript editing uses DM Sans.
3. Reserve stable space for catalog shelves and loading placeholders; the observed layout movement needs improvement. Investigate individual shift entries before changing layout.
4. BookCover already lazy-loads images, but displays original uploaded URLs. Add appropriately sized cover variants or compatible image optimization, preserving fallback covers and aspect ratio.

PDF workers, OCR workers and OCR language models were not requested on Browse. Preserve that on-demand behavior and never cache authenticated API responses as a speed optimization.

References: [Firestore cursor pagination](https://firebase.google.com/docs/firestore/query-data/query-cursors), [web font optimization](https://web.dev/articles/optimize-webfont-loading).
