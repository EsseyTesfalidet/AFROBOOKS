# Admin workspace release — 2026-09-27

The admin area now uses one responsive workspace with grouped navigation, section search, clearer typography, restrained colors, and one shared mobile navigation control. Duplicate dashboard cards and rows of moderation buttons were removed. Book covers use the same real-image component as the catalog.

Books, people, reports, verifications, subscriptions, orders and payouts have searchable/filterable views with 15-row display pagination. Selecting a record opens an accessible modal detail panel with the relevant controls. Panels trap focus, close with Escape and return focus to the originating control. Permanent book/account deletion still requires explicit confirmation. Administrator accounts remain protected from moderation. Database snapshots keep changed or deleted records current.

Revenue separates completed sales, the platform share, and earned royalties. Date ranges include zero-sale days and exclude future, pending, refunded, disputed and review-held orders from earnings totals. Payouts distinguish confirmed transfers to Stripe from actual bank payouts. CSV exports follow the current order filters and escape spreadsheet formula prefixes. The overview surfaces publishing, moderation, identity and payout exception queues without claiming that a fetched dashboard is an uptime monitor.

Reports retain the full reason and support a recorded review note. Identity review now changes the request, seller verification and notification in one transaction; concurrent reviews cannot create duplicate approvals or notifications. Author email verification is not assumed. Announcements support editing, audience selection, inactive drafts, save recovery and dirty-form protection. Settings have load/save recovery, decimal commission validation, and merge only editable fields so an older screen cannot overwrite live payout activation.

## Validation

- 23 unit tests, including financial date boundaries and CSV safety.
- 31 Firebase emulator integration tests, including atomic/concurrent identity review, denied self-approval, book deletion, authenticated access and royalty reconciliation.
- Headless browser checks exercise every admin screen, search/filter/pagination, real image rendering, dialog focus and Escape, protected admin accounts, failed mutations, confirmation/cancellation, CSV download, announcement recovery, settings preservation, access denial and 375px mobile layouts. These use synthetic records and never moderate production accounts or publish announcements.
- Production build and TypeScript checks; targeted lint for admin code.

## Operational status and next upgrades

Author royalties were enabled after confirming ten sellers, no connected Stripe accounts, no orders, no payouts and zero financial balances. The deployed Firebase function binds Secret Manager version 1, runs hourly, and completed a verification run with `enabled: true, paid: 0, pending: 0`. The payout release commit is `09dbcc1`.

Authors still need to complete Stripe-hosted identity and bank setup. Countries are selected from the platform's Stripe Connect onboarding configuration; enable supported countries and transfers there. No real author onboarding, purchase or bank payout was performed during this release.

Prioritize the following follow-up work:

1. **Dependency security.** The initial production dependency audit reported 40 affected package entries in the web app and 16 in Firebase Functions. This release upgrades Next.js to patched 16.3.3 and patches the web app's transitive `websocket-driver`; the final web audit has 35 affected entries (0 critical, 14 high, 20 moderate, 1 low). The separately deployed Functions dependency tree still has 16 entries (1 critical, 4 high, 10 moderate, 1 low). These counts include transitive dependencies and do not by themselves establish that every advisory is exploitable. The remaining Firebase SDK, editor and older PWA toolchain need a dedicated compatibility upgrade. Do not use `npm audit fix --force` blindly: it proposes major migrations and even a PWA downgrade. See the official [Next.js AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).
2. **Financial exception handling.** Refunds, disputes and ambiguous transfers currently hold further royalties for manual reconciliation. Build an audited refund/reversal workflow and reconcile actual Stripe processing/Connect costs before treating the commission estimate as net profit.
3. **Scale and observability.** Display pagination currently filters collection snapshots in memory. Move large admin tables to cursor-based server queries and use aggregate financial summaries as records grow. Add persistent moderation audit history and alerts for failed webhooks, payout exceptions and backup/restore checks.
4. **Offline behavior.** The old `next-pwa` wrapper targets Webpack while production builds use Turbopack. Verify or replace service-worker generation before offering offline installation as a supported feature. Do not cache authenticated financial or paid-book responses without an explicit entitlement design.

The redesigned admin workflow is ready to use. These remaining upgrades should be tracked before making a blanket claim that the whole platform has completed production hardening.
