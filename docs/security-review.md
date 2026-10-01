# Security review — September 30, 2026

This review covers application code, dependencies, authorization rules, session handling and browser caching. It is not a penetration test or a guarantee against future breaches.

## Changes

- Retired the unauthenticated `/api/email` relay. Signup still sends Firebase email verification; the separate welcome email is removed. Receipts and other trusted server mail remain. User-supplied text in transactional HTML templates is escaped.
- Retired the unused website proxy for administrative role bootstrapping. The separate Cloud Function continues to require its bootstrap secret.
- Verify token revocation for bearer tokens and legacy session tokens. Browser mutations using session cookies reject foreign origins; session creation and logout have the same protection. Navigation hint cookies do not grant API permissions.
- Firestore and Storage use the current database role and account status, instead of trusting stale role claims. Suspended users cannot read paid chapters, financial records or private files, or modify account data. Own profile reads remain available for signup and account-status handling. Public catalog samples remain public.
- Suspension disables Firebase Auth and revokes refresh tokens. Database status changes first so authorization rules deny access even if the Auth update fails; an administrator can retry the action.
- Replaced the obsolete PWA worker with a small worker that caches only public, content-hashed application bundles and a generic offline page. It deletes known legacy caches when activated and never caches APIs, private HTML or remote files. Already-installed clients receive the update on their next online visit; an offline device cannot be remotely cleared.
- Added anti-framing, MIME-sniffing and referrer headers, a limited CSP for framing/base/object restrictions, and no-store headers for APIs. This is not a full script-nonce CSP.
- Updated vulnerable dependencies, upgraded the editor to Tiptap 3 and removed next-pwa. Compatible-major overrides patch Firebase's pinned grpc/undici packages; background workers use patched uuid/qs versions. Keep the overrides under review when upgrading Firebase.

## Verification

- `npm test`: 60 passing tests, including origin rejection, revoked-token checks, forged navigation cookies, retired endpoints and HTML injection regressions.
- `npm run test:rules`: 92 passing Firestore/Storage emulator tests, including suspended accounts, stale admin claims, private content, purchase fulfillment, duplicate payments, refunds and author payouts. Uses synthetic payments; no real charges or emails.
- `npx tsc --noEmit` and `npm --prefix functions run build`.
- `npm audit` and `npm --prefix functions audit`: zero known vulnerabilities at review time. This only measures the current advisory database.
- `tests/service-worker.browser.cjs`: actual browser verification of legacy cache deletion, account isolation, blocked offline API access and public-asset offline behavior. Run with `PLAYWRIGHT_PATH` pointing to Playwright and optionally `EDGE_PATH` for an installed browser.
- Browser regression checks exercise the upgraded editor, multilingual PDF import, English/Tigrinya OCR, failed downloads, cancellation, limits and mobile layouts in Chromium and WebKit.
- Production build and read-only/unauthenticated endpoint smoke checks before release.

## Operational follow-up

The website, Firestore/Storage rules and all five Cloud Functions deployed successfully. Live checks confirmed the retired endpoints, origin protection, payment/private-file authorization, security headers, worker activation and new fonts. Firebase reported a non-blocking failure cleaning up old build images; review the project's Container Registry build artifacts to avoid unnecessary storage charges. No production payments or emails were manually sent during verification.

Keep dependency scans and access-control tests in the release process. Protect the Firebase, Vercel, Stripe and GitHub administrator accounts with MFA, and review provider audit logs for unexpected activity. This review does not establish whether earlier abuse occurred. Stripe destination-charge activation remains a separate rollout requiring confirmed successful webhook delivery and connected-account validation.
