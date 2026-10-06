# Separate website accounts

In the website Account panel, author profile panel or admin sidebar, select
**Sign in to another account**. A new tab opens at `/login?account=separate`.
Sign in there without changing the account in the original tab. Repeat the
action to open additional accounts. Ordinary new tabs keep the normal login.
The option is hidden in the installed mobile app.

Separate tabs retain their login on reload and have independent carts, recently
viewed books and reader settings. Signing out of a separate tab clears its cart
and recently viewed list, and does not sign out other tabs. Sign out when finished
on a shared computer; browser tab restoration can restore session storage.

## Isolation

- A named Firebase app uses `browserSessionPersistence` for separate accounts;
  the normal website and installed app retain the existing Firebase app and login.
  The link uses `noopener noreferrer` so new tabs do not inherit session storage.
- Separate accounts do not create, overwrite or delete the normal session cookies.
  Client API requests omit cookies and use the current Firebase bearer token.
  The API rejects cookie fallback for requests marked as separate-tab requests.
- The `ab_tab_accounts` cookie only disables shared-cookie navigation redirects.
  `AccountRouteGate` checks the current tab's identity/status/role before mounting
  protected pages. APIs and Firestore rules remain responsible for authorization.
  The cookie, route query, display mode and client gate never grant data access.
- The installed app retains its existing single-account login. Upload limits
  and Android billing/release configuration are unchanged.

## Verification

`tests/tab-account.browser.cjs` runs the actual login form, Firebase configuration,
auth provider, account route gate, cart, network helper and session endpoint with
local Auth/Firestore emulators. It signs in three accounts within one browser
context and checks reloads, independent carts, cookie preservation, bearer-token
identity, failed cookie fallback, creator/admin navigation and sign-out in both
directions. No production accounts or payments are used.

Run with the Auth/Firestore emulators in `firebase.auth.test.json`; set
`PLAYWRIGHT_PATH` and `EDGE_PATH` if browser tooling is installed outside the repo.
Unit coverage is in `tests/tab-account.test.ts`, with existing security and payout
reminder tests covering authorization and redirect compatibility.
