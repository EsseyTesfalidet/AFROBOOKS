# Legal information and agreement

Public documents live at `/terms` and `/privacy`, with dated versions, section navigation and a shared responsive layout. The old `/terms#privacy` anchor remains valid and links to the full privacy document. The contact address uses the existing public AfroBooks support address; no unverified legal entity, postal address or governing jurisdiction is invented.

The copy reflects current reader access, record retention, account deletion, Stripe author onboarding, separate transfers and bank payouts, and first-party book promotion measurement. Refund wording preserves mandatory consumer rights. Provider links were checked against their official privacy notices. This is an implementation of the app's current practices, not a certification of compliance in every jurisdiction.

`lib/legal.ts` defines the current version. Email signup requires an unchecked-by-default agreement checkbox and records the acceptance after account creation. Existing and Google-authenticated users see the mandatory review screen until the current version has been saved. Public legal documents remain accessible. Declining offers sign-out and support contact; cancellation, deletion and support APIs do not require a new agreement.

`POST /api/account/agreement` requires authentication, explicit `termsAccepted: true`, `privacyAcknowledged: true` and the current version. It rejects unknown fields, client timestamps and outdated versions. A Firestore transaction writes one immutable receipt per user/version at `legalAgreements/{uid}/versions/{version}` and a current summary on the user profile. Repeated submissions preserve the original server acceptance time. No IP address or user agent is added to the receipt.

Firestore rules prevent clients from creating fake agreement fields during registration, modifying the user summary, or writing receipts. Users can read only their own receipts; administrators can read receipts for support. New book checkout, publishing, Stripe onboarding and promotion submission/payment additionally check the saved agreement on the server. Existing payment fulfillment and author transfers continue independently of reacceptance.

For future material document changes, retain the previous text in version control, update the document date and `LEGAL_VERSION`, and publish both documents and the API together. Do not silently edit an accepted version. Agreement does not imply marketing consent. Receipts currently remain after account deletion for agreement history; review actual retention needs before adopting fixed retention promises.

Validation: 31 unit tests and 52 Firebase integration tests passed. The integration suite verifies receipt privacy, rejection of forged/unapproved/old submissions, safe retries, and deleted or suspended accounts. Browser checks cover both public documents, mobile layout, anchors, mandatory checking, outdated versions, failed-save recovery and sign-out. One earlier emulator run hit the existing transient payout transaction error; the complete final suite passed.

Deploy Firestore rules before promoting the web deployment. Review the operator's legal identity and applicable jurisdictions with qualified counsel before making any claim of jurisdiction-specific compliance.
