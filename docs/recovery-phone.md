# Recovery phone

**Current behavior (2026-10-07):** phone is an account-recovery method, not a way to open the AfroBooks library by itself. Older Firebase phone sessions are signed out by the auth observer; server session creation and authenticated API access also reject phone-only authentication.

Readers and authors link a number under **Account → Settings → Recovery phone** while already signed in. Setup asks them to re-confirm their existing password or Google/Apple identity, then verifies the number with SMS. Firebase links the number to the same UID, keeping purchased content together.

On the mobile sign-in page, **Forgot email or password?** accepts the linked number. After code verification, the server checks for an active AfroBooks profile and reports the account email and original sign-in providers. Password-enabled accounts can request a Firebase reset email; Google/Apple accounts are directed to their existing provider. Recovery uses a separate Firebase Auth app with in-memory persistence and never sets the normal app session, session cookie, profile, or library state.

Firebase may create an Auth identity while verifying a number that was never linked. The server rejects it, and a fresh phone-only identity with no AfroBooks profile is deleted. Existing phone-only or restricted accounts are not deleted, merged, or signed in; they need support to restore an email-based sign-in. Firebase reCAPTCHA, SMS quotas, resend cooldown and the US/NG/GH allowlist remain in effect.

The current code rejects Phone as a provider at POST /api/auth/mobile-profile; profile creation remains limited to Google and Apple. POST /api/auth/account-recovery accepts only a verified Phone ID token and returns recovery details only for a matching, active profile.

The remainder of this file records the earlier phone-as-sign-in behavior and is retained as history; it no longer describes the current app.

---

## Previous phone sign-in behavior (historical; superseded)

Readers open Account > Settings > Recovery phone. Authors can use their account settings too.

1. Sign in with the existing account, then confirm its current password or linked Google/Apple identity.
2. Enter a supported phone number and verify the SMS code.
3. Later, choose Phone on the mobile sign-in screen to return to the same account and library.

Linking uses Firebase `linkWithPhoneNumber`, preserving the UID and all purchases. An unlinked number used on the sign-in screen can still create a separate account; it does not recover an existing email account automatically. Numbers belonging to another account cannot be linked or automatically merged. This initial flow does not replace or remove an already linked number.

The settings flow requires recent authentication, checks the UID around asynchronous operations, and has a resend cooldown. Firebase enforces code verification and SMS limits. It uses the existing phone-provider switch and Ghana/Nigeria/US SMS allowlist; no SMS policy changes are made here.

`GET /api/auth/recovery-phone` reports the signed-in user's authoritative Firebase Auth phone and original sign-in providers. `POST` accepts only an empty object and mirrors that verified phone to the same Firestore profile, changing only `phone` and `updatedAt`. Editable contact numbers are never evidence of phone ownership. Missing or restricted accounts cannot be restored through this endpoint.

If linking succeeds but profile synchronization is interrupted, **Refresh account details** retries the sync without another SMS. **Refresh phone status** retrieves the authoritative state after returning to settings.

## Validation

- `npm test`: unit and authorization checks, including recovery-phone rules.
- `npm run test:recovery-phone`: local Firebase Auth/Firestore emulator integration, retaining purchased book and video access after phone sign-in and rejecting another account's number.
- `node tests/recovery-phone.browser.cjs`: real UI/client helpers with Firebase/network boundaries mocked; supports `PLAYWRIGHT_PATH` and `EDGE_PATH` for an existing browser installation.

Automated tests do not send real SMS messages. Carrier delivery and provider popups still require a real-device check with a consenting account holder.
