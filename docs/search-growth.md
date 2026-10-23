# AfroNarra discovery and promotion

## What the site provides

- The public homepage renders its heading, category links and available releases
  in the server response. Account initialization does not blank the website.
  Installed-app sign-in requirements and paid access remain enforced.
- Public release pages include creator descriptions, subjects where supplied,
  language, format, breadcrumbs, related releases and share/copy-caption buttons.
- Book excerpts come only from `isPreview == true` chapters of released, live
  text books. PDF issues, unpublished books and unreleased preorders have no
  inline text sample. Book sample permissions are checked on each page request.
- Audio previews sign only the separately generated, at-most-60-second sample
  of a published, ready recording. There is no public full-recording endpoint.
  No sample is generated, purchased or counted for royalties by this endpoint.
- Video previews continue to use only the creator's approved published trailer.
  A release with no preview still has a public information page; it does not
  promise a preview or expose the paid recording.
- `/tigrinya-books` and `/african-documentaries` group matching published content.
  They enter the sitemap only when matching releases exist. Empty collections
  are marked `noindex, follow`. Collection links appear where matching content
  exists. They do not create or translate content or assert that it is free.

## Start with one audience

Keep the Read, Watch and Listen platform. For the first promotion experiment,
choose one audience supported by actual releases, such as Tigrinya-speaking
readers. Choose a few creators who can consistently share useful work.

For each release, the creator should:

1. Write an original description: what it covers, who it is for, its language,
   and why someone would enjoy it. Use accurate subject tags. Keep the original
   title and add any English explanation in the description rather than
   inventing translations or filling the title with keywords.
2. Enable an appropriate preview in the studio: public book chapters, an
   official film trailer or the existing first-minute audio sample.
3. Open the public release page and use **Copy caption & link**. Edit the short
   caption to explain the work and share it with relevant communities where
   promotion is welcome. Link to the specific release rather than the homepage.
4. Ask interested visitors for feedback on the preview and sign-up experience.

Suggested caption (fill in real details):

> [Title] by [Creator] is now on AfroNarra. A [language] [book/film/audio release]
> about [specific subject]. Explore it here: [public release link].

Only add “Read/watch/hear a free sample” when the page actually offers one.
No messages are sent automatically by these changes.

## Weekly measurement in Google Search Console

Use the verified `afrobs.com` property and submit `https://afrobs.com/sitemap.xml`.
After deployment, inspect the homepage and populated collection/release pages,
test their live URLs and request indexing. This does not guarantee indexing or
a ranking improvement. There is no need to upload a new sitemap manually each
time a creator publishes.

In Performance → Search results, use a complete 28-day period and compare it
with the preceding period. Save the same filters each week:

- All queries: clicks, impressions, CTR and average position.
- Brand searches: query → Custom (regex) → Matches regex:
  `(?i)(afro\s*(books?|narra)|afrobs)`.
- Discovery searches: the same regex with **Doesn't match regex**. These are
  searches for content rather than known brand names. Review which queries and
  public pages earn them, then check country and device where useful.
- In Page indexing, inspect important excluded release pages and actual errors.
  Do not assume every excluded URL is an error or every sitemap URL is indexed.

The supplied September 24–October 21, 2026 query table showed 69 clicks and 194
impressions across its visible rows. All 69 clicks were brand variations.
These are query-row sums, not guaranteed account totals: Search Console can
omit queries for privacy. Keep the account's top summary totals separately.

Track a weekly sheet with: period, brand clicks, discovery clicks, best release
pages, new sign-ups, first previews and purchases. Search Console measures
search performance; it does **not** measure sign-ups, preview playback or
purchase conversion. Those conversion columns require verified product
analytics or a documented manual count. This change does not add an analytics
vendor, tracking cookies, or claim those conversions are already measured.

## Check the result

Look for growth in relevant discovery queries and visitors who try a release.
With small traffic volumes, individual days and percentages can be noisy.
Keep the name, domain and URLs consistent while testing the content and
promotion. Review useful results over several weeks before expanding.

References: [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide),
[JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
[Search Console performance report](https://support.google.com/webmasters/answer/7576553).
