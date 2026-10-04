# Installed app sign-in

`LoginForm` selects `MobileSignIn` after installed mode has hydrated. The normal browser website keeps its existing email/password and Google layout. `/login` uses a fixed, scrollbar-free app frame. Typical phone sizes fit the screen, and landscape uses a two-column layout. The form panel can scroll internally when the keyboard, enlarged text or unusually long errors need room. At the owner's request, installed app page zoom is now locked; normal website zoom is unchanged.

The revised screen centers the existing AfroBooks logo and wordmark above a rounded form card. It uses a subtle warm background, clearer spacing, floating labels, Email/Phone selection, Google/Apple buttons, password reveal, a brief button sheen, press feedback, inline error shake, supported optional haptics and a drawn success check. The full screen follows light/dark mode. Book illustrations and the diamond-pattern hero were removed at the owner's request. Reduced motion disables decorative effects. Small portrait screens use a compact horizontal logo; landscape places the logo beside the form.

Phone entry uses `libphonenumber-js/min` and a native accessible country selector. The initial SMS rollout allows Ghana (+233), Nigeria (+234) and the United States (+1), matching countries recorded in existing profiles. Pasted international numbers outside that list produce an email/Google alternative before requesting reCAPTCHA or sending SMS. Firebase enforces the matching allowlist; the client list is presentation only. Six code inputs support advance, backspace, arrow keys, autofill and full-code paste. The sixth digit verifies once; failed codes can be corrected. Resend uses a 30-second deadline that survives a refresh, without storing the number or code. Firebase reCAPTCHA and Firebase quotas remain enabled. The client countdown is a usability feature, not a security rate limit.

Successful installed-app sign-in opens `/library` for readers and authors. Explicit valid return links and the admin workspace retain priority. Authentication holds the existing observer guard until the profile is ready. Credentials, tokens and codes are not logged or persisted by this UI.

## Author website handoff

In the installed app, the signup Author option, profile author action and Author Studio switch open `/author/start?view=web` with a separate `noopener` browser context. The originating app stays in its reader view. Normal website role controls retain their existing behavior. The browser decides whether to display the destination as a new tab or window.

The landing page offers existing-account sign-in or new author signup. A signed-in reader explicitly enables author tools through the existing authenticated profile endpoint; opening the link alone does not change their role. Existing authors continue to their dashboard. New author setup respects the platform signup/maintenance setting, with server authorization remaining authoritative. The same Firebase identity preserves the library and reading progress; users should use their original sign-in method. The browser may require another login, and the author sign-in flow includes the existing phone option for phone-only readers. No tokens or account identifiers are passed in the URL.

The exact author entry URL sets a per-tab website presentation marker so installed-mode signals do not force that tab back into reader layout. This is a display choice, not an authentication bypass. With session storage blocked, the initial entry still uses website presentation, but it may not survive a full navigation. Other tabs remain unchanged.

`tests/author-web-handoff.browser.cjs` exercises the real links, bootstrap, signup selection, landing page and phone sign-in return with mocked authentication boundaries. It checks separate tabs, unchanged mobile roles, explicit same-account activation, closed registrations and normal website behavior using simulated iOS/Android installed signals. The existing mobile access and sign-in browser suites also pass. These checks do not verify placement on physical iOS or Android devices. The owner approved deploying this handoff on 2026-10-04. The proposed preview-to-checkout change was withdrawn: “View full book” retains its book-details destination. The reported backward jump for Tigrinya previews remains unconfirmed; live browser checks of the three titles reached their book details in scrolling and paged modes.

## Provider configuration remains required

A follow-up check on 2026-10-04 confirmed that the owner enabled Phone and Apple in Firebase. Google and email/password remain enabled, and `afrobs.com` is authorized. Apple still has no Service ID (`clientId`) and an empty signing configuration. No fictional phone numbers are configured. After the owner delegated the SMS country choice, the Firebase SMS policy was changed from unset to an allowlist of US, NG and GH and read back to verify it. The update mask covered only `sms_region_config`. This live Firebase policy change did not deploy the app or enable its production UI. No live SMS was sent and no real account was created.

The local `.env.local` settings now enable the phone interface for review while keeping Apple unavailable:

```dotenv
NEXT_PUBLIC_AUTH_PHONE_ENABLED=true
NEXT_PUBLIC_AUTH_APPLE_ENABLED=false
```

Phone entry is available in the local build. Apple remains marked unavailable and explains this when tapped; email and Google remain usable. These are build-time switches. The production Phone switch is now prepared for the next approved deployment following the integration check below; Apple stays off. Before enabling Apple, complete its web configuration and verify the flow, then rebuild as part of an approved deployment. Adding SMS countries requires updating both Firebase's allowlist and `mobileSmsCountries` in `lib/auth/mobileSignIn.ts`. Region limits do not cap spending; SMS is billed by destination under [Google's current pricing](https://cloud.google.com/identity-platform/pricing?hl=en).

- Phone: enable Firebase Authentication → Sign-in method → Phone, set allowed SMS regions, confirm authorized production domains, review SMS billing/quotas, and configure fictional test numbers. Verify a fictional number on an authorized hosted domain before real SMS testing. Never disable app verification in production. [Firebase phone authentication](https://firebase.google.com/docs/auth/web/phone-auth).
- Apple: requires Apple Developer membership and a Services ID. Configure the Firebase return URL in Apple, then add the Team ID, Key ID and private key directly to Firebase's Apple provider settings. Never put private keys in `NEXT_PUBLIC_` variables, source control or chat. Configure Apple's private email relay as needed. Test both ordinary email and Hide My Email identities. [Firebase Apple authentication](https://firebase.google.com/docs/auth/web/apple).
- Social sign-in uses Firebase popups directly from the button click. Cancellation stays cancelled; blocked popups display a recoverable message. Test real installed iOS and Android TWA devices, including popup cancellation and blocking. [Firebase redirect/storage considerations](https://firebase.google.com/docs/auth/web/redirect-best-practices).

## Account integrity

`POST /api/auth/mobile-profile` requires a revocation-checked Firebase bearer token from Phone, Apple or Google and rejects cross-site mutations. UID, email, phone and display name come from the Admin SDK identity, never the request body. An atomic Firestore transaction creates only a buyer profile and never overwrites existing profiles. Suspended, banned and disabled identities are denied. A missing profile on an identity older than ten minutes requires support rather than automatic recreation.

A different, unlinked identity can create a separate account. A contact phone saved in a profile is not a linked Firebase sign-in provider. Existing readers are directed to their original method. This feature never merges accounts or grants purchases by matching contact details. Phone-only accounts have no email address: in-app receipts remain available, but email delivery needs an email-backed identity. Account linking/email collection is a separate follow-up before marketing phone sign-in as interchangeable with existing account access.

## Verification

`npm test` covers number normalization, profile creation/preservation, restricted/old identities, unauthorized requests and errors. `tests/mobile-signin.browser.cjs` tests the actual form/shell/keyboard with fake Firebase boundaries: six portrait/landscape sizes, fixed frame, validation, password reveal, return links, keyboard/large text, country selection, OTP entry/paste/retry, resend, success, social adapters, reduced motion and unchanged website behavior. Set `PLAYWRIGHT_PATH`, optional `EDGE_PATH` and optional `SCREENSHOT_DIR`. These simulations do not verify live SMS delivery or real Apple OAuth configuration.

The owner approved publishing the previous sign-in appearance release on 2026-10-04 with Phone and Apple switches off. Email and Google remain available on that release. The separately authorized Firebase SMS country policy is already active.

## Phone activation prepared; Apple enrollment pending (2026-10-04)

The owner requested Phone and Apple sign-in and confirmed they have not enrolled in the Apple Developer Program. A fresh read of Firebase confirmed Phone enabled, `afrobs.com` authorized, and the US/NG/GH SMS allowlist. Apple is toggled on in Firebase but still has no Services ID, Team ID, Key ID or private key; its app switch must remain off until that setup and verification are complete.

The one-off ignored `.vercel/mobile-phone-hosted.cjs` check exercised the real `MobileSignIn`, Firebase SDK, deployed `/api/auth/mobile-profile` and `/api/auth/session`, and Firestore profile reads. An isolated browser intercepted only its test page and JavaScript at the `afrobs.com` origin; no page was published or deployed. A temporary reserved fictional phone number and random verification code were configured for the check. An incorrect code stayed signed out; the correct code created a buyer profile, returned HTTP 200 from both auth endpoints, set a secure HttpOnly session cookie and selected `/library`. Signing out and back in preserved the same UID and profile. Cleanup removed the temporary number/code and test identity/profile and verified the provider and SMS country policy were unchanged.

Firebase's documented fictional-number verification mode was used only in that isolated test bundle. Production application verification remains enabled. This confirms the real authentication/profile/session integration, not real SMS delivery, carrier behavior or a physical-device reCAPTCHA challenge. No SMS was sent. The existing simulated mobile sign-in browser tests also passed in standalone/iOS/Android modes, along with all seven targeted authentication tests.

Vercel **production build settings** are now explicitly `NEXT_PUBLIC_AUTH_PHONE_ENABLED=true` and `NEXT_PUBLIC_AUTH_APPLE_ENABLED=false`. Saving these settings did not change the previously deployed build. The owner subsequently approved deploying phone sign-in with the mobile light-mode and reader updates on 2026-10-04. Apple remains unavailable pending membership and provider configuration.
