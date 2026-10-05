# Recovery phone

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
