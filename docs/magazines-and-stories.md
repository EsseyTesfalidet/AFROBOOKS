# Magazines and short stories

Authors choose Book, Magazine issue or Short story in Publish. Older listings without a publication type remain books. Organizations publish through an author account, enter their organization as the publisher name, and use that account's existing Stripe setup. Each magazine issue is a separate listing, price and permanent library entitlement. This does not create a recurring magazine subscription or team account.

## Illustrated magazines

A magazine can use the existing editor/text import or upload a finished PDF, retaining photos, columns and page layouts. PDF issues accept unencrypted files up to 20 MiB and 500 pages. Publishers supply a cover and description; full PDF pages are accessible after purchase. There is no public full-file preview or permanent public download link.

Files upload directly to Firebase Storage under an author/book-specific path. Storage permits creation only for an owned magazine draft and denies client reads, replacements and deletions. The server parses the PDF, records its Storage generation and page count in the server-only `publicationFiles` collection, and requires this record before publication or checkout. The authenticated PDF endpoint verifies ownership/library access and streams the recorded file generation. Removed/deleting publications are denied, and normal book cleanup removes magazine files and private metadata.

PDF.js is hosted with the app, including its worker, fonts and image decoders. The reader renders pages and images, supports zoom and window rotation, exposes extracted page text when available, and remembers the last page on the current device for the signed-in reader. Scanned/image-only PDFs may have no extractable text. The viewer does not run embedded PDF actions or provide an annotation/script layer. Authorized readers necessarily receive the file bytes; this is access control, not DRM.

## Affordable story bundles

Short stories can be priced from $0.10. The advisory range is $0.10–$0.99, with $0.25 as a starting suggestion; authors retain control. Story pricing shows a combined-cart earnings example instead of incorrectly applying a separate fixed processing fee to every story.

Readers can add stories directly from Browse and pay once for up to 20 titles. A cart containing a title below $0.50 must reach $1.00 **after** the existing 5% discount for three or more titles. Other carts retain a $0.50 minimum. This is enforced on the server and explained in Cart before payment. The app never raises the total to meet the minimum or adds a surcharge. A reader can combine stories with ordinary books or magazine issues.

Examples: five $0.25 stories total $1.19 after discount; ten $0.10 stories total $0.95 and need another title; eleven $0.10 stories total $1.04. At the default 15% commission and standard estimated US card processing, the $1.19 cart allocates $0.33 to processing, $0.13 to AfroBooks and $0.73 across the authors. Actual processing costs may vary. The same integer allocation, purchase deduplication, fulfillment and author royalty system used for books handles these titles.

The $1.00 micro-title basket minimum is an AfroBooks product choice to share transaction costs. Stripe's stated USD minimum is $0.50. References: [Stripe currency minimums](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts), [Stripe pricing](https://stripe.com/pricing), [PDF.js](https://mozilla.github.io/pdf.js/).

## Deployment

Deploy `storage.rules` before releasing PDF upload. `npm run build` runs `scripts/prepare-pdf-assets.cjs` to copy PDF.js assets into the ignored generated `public/pdfjs` directory. Other server-only collections already fall under the default Firestore deny rule. Destination-charge activation remains governed by [its separate checklist](destination-charges.md).

## Validation

47 unit tests and 90 Firestore/Storage integration tests passed. They cover cheap-story minimums after discounts, exact fee allocation, PDF parsing and publication, private metadata, client upload/read/overwrite/delete restrictions, ownership after fulfillment and existing payment regressions. Browser checks exercised the actual PDF reader with an embedded PNG, text extraction, page navigation, saved page, zoom and rotation; the actual pricing component was checked for story-cart estimates and different commission rates. Production build and TypeScript checks passed. No live charge was made; physical iOS/Android testing remains separate.
