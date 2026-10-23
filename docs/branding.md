# AfroNarra display branding

The public name is **AfroNarra** and the tagline is **Read. Watch. Listen.**
The homepage introduces African books, films, documentaries, music, podcasts and
audiobooks together. Core display constants live in `lib/brand.ts`.

The existing gold A mark and icon artwork are unchanged. Its asset filenames
remain stable, including `/brand/afrobooks-mark.svg`.

This is a display rebrand. Keep `afrobs.com`, existing URLs, Firebase project and
user IDs, Android package `com.afrobs.app`, signing certificates, payment product
IDs, webhook URLs, sender email addresses, storage keys and font family names.
Existing purchases, profiles, subscriptions, libraries and reading progress use
those identifiers. Website metadata and structured data use only the new display name.

## Release notes

- Deploy the website for the new in-app and website branding to appear.
- Android source manifests and launcher strings use AfroNarra. An existing APK
  keeps its native launcher name until a newly built update is installed. No
  version code has been changed or Android release created for this rebrand.
- Play Console store listing text and feature graphics, Firebase/Google consent
  screen branding, Stripe business display names and configured email sender
  overrides are managed outside this repository. Review those separately when
  adopting the name publicly; never change account or payment IDs for a rename.
- Keep the existing support mailbox and social URLs until replacement addresses
  and handles are owned and configured. Show a support link instead of the old
  branded address. Historical emails and records are not
  rewritten.
