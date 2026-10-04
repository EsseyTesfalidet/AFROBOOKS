# Installed app sign-in

Android/TWA, installed PWA and iOS standalone sessions require a matching Firebase user and active/warned account profile before showing app screens or adding cart items. `/login`, `/signup`, `/privacy` and `/terms` remain accessible. Regular desktop and mobile websites retain guest browsing and guest carts.

The head bootstrap identifies installed mode before content paints. `MobileAccessGate` hides app screens while authentication is restored and redirects guests to sign-in. The cart store also checks installed-app authentication to cover sign-out races. Saved carts are preserved: the app and website can share browser storage, so app sign-out must not erase a website cart. Android mode survives full sign-in navigations through a tab-scoped marker; no permanent browser-mode cookie is set.

Validated `appReturn` destinations preserve book and other app links across login/sign-up. Gift claim tokens stay in session storage and are excluded from sign-in URLs. Normal website login destinations are unchanged.

This is an installed-app entry policy, not a new server authorization boundary: public website catalog data stays public. Existing server authorization and paid-book access checks remain responsible for protecting purchases and accounts. Display mode never authorizes a payment or content purchase.

Validation: `npm test`; `tests/mobile-access.browser.cjs` with `PLAYWRIGHT_PATH` and, optionally, `EDGE_PATH`. The browser check exercises the actual gate, auth provider and cart with fake Firebase boundaries, including pre-hydration visibility, website behavior, sign-out and gift links. No live accounts or payments are created.
