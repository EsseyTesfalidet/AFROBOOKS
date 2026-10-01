# Author-controlled pricing guidance

The Pricing step in Publish suggests a range while the author keeps the final choice. Editing an existing book preserves its price. Choosing a suggestion changes the draft only; publishing/saving remains explicit. Prices outside the suggested range are allowed within the existing checkout limits. No paid AI or external pricing service is used.

The first version uses editorial starting ranges, not observed market prices or sales forecasts. Manuscript word count informs ordinary prose suggestions; poetry and children's titles use a general range because word count alone poorly represents their value. Authors should compare similar titles and assess sales after launch.

| Manuscript | Range | Starting price |
| --- | --- | --- |
| Under 10,000 words | $0.99–$2.99 | $1.99 |
| 10,000–39,999 words | $2.99–$5.99 | $3.99 |
| 40,000 words or more | $4.99–$9.99 | $6.99 |
| Poetry, children's titles, or unknown length | $2.99–$7.99 | $4.99 |

Ranges are defined in `lib/utils/pricingGuidance.ts`. Each suggestion displays estimated author earnings using the current platform commission and the same fee calculation as checkout. Authors can also enter a custom customer price or desired net earnings. Existing bundle-discount and estimated processing-fee behavior is unchanged.

Validation: unit coverage checks range boundaries and checkout/fee compatibility. Browser checks confirm existing-price preservation, suggestion selection, custom prices outside the guide, invalid amount rejection, recovery from invalid input, target earnings and layouts at 320, 390, 844 and 1280 pixels. The combined production build passed.
