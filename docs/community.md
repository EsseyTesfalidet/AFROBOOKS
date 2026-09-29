# AfroBooks Community

Community is a separate, public section at `/community` with two views:

- **Weekly Question**: an administrator chooses and publishes a featured question. Existing questions remain open for replies when a new question is featured.
- **Find a Memory**: signed-in members post requests about forgotten stories, sayings, songs, or childhood games. The request author can mark another member’s reply as helpful and reopen the request later.

## Administrator workflow

Open **Admin → Community** (`/admin/community`). Choose **New weekly question**, edit the suggested opening question, optionally add context, and publish. Nothing publishes automatically, and there is no requirement to change the question on a fixed day.

Open a conversation to hide or restore it or individual replies. Reports have their own queue on this page. A report links directly to the relevant reply, even when it falls beyond the first page of replies. Mark a report reviewed after handling it. Hiding a featured question removes it from the public featured slot; feature another question or restore it when appropriate.

## Participation

Visitors can read and share links. Signing in or creating an account preserves the requested Community destination. A member’s display name (username or first name), contribution, and any voluntarily entered region/language are public. Account email, phone, and financial details are never included in Community responses.

Members can reply to a conversation or a particular reply, report contributions, and remove their own contributions. Request and reply text stays in the editor after a failed save. Retried submissions use stable attempt IDs so a lost response does not duplicate a post or notification.

Replies create in-app notifications for the conversation author and, when applicable, the author of the reply being answered. A member is not notified about their own reply. This feature does not send emails. Marking a memory found also notifies the helpful contributor.

The first version supports text only, with optional region and language tags. It includes no paid services, AI calls, audio, question suggestions, or automatic weekly publishing.

## Persistence and permissions

`/api/community` handles all reads and writes through Firebase Admin. Private collections are `communityPosts` (with `replies` subcollections), `communitySettings`, `communityReports`, and `communityLimits`. Browser Firestore access to all four is denied, including for administrators; the API verifies the administrator role from the current user record.

Public feeds expose active posts only. Hidden replies become empty placeholders; removed replies have their text cleared. Removing a memory request clears its main text and makes the conversation and replies inaccessible through the public API. Hidden/removed accepted replies clear the found state and update visible reply counts transactionally.

Transactions enforce active account status, ownership, administrator privileges, duplicate protection, and reply counts. Limits per UTC day are five new requests (30 posts for administrators), 60 replies, and ten reports. Cooldowns are 30 seconds for new posts, ten seconds for replies, and five seconds for reports. Reporting the same item twice does not create two reports.

## Release and validation

Deploy the Community indexes in `firestore.indexes.json` before releasing the web app. The indexes cover active feeds and open moderation reports. The explicit rules in `firestore.rules` document the API-only access; the pre-existing rules also deny these unknown collections by default.

```powershell
firebase deploy --only firestore:rules,firestore:indexes
npm run build
```

Publish the first weekly question from the admin interface after deployment. There is an intentional empty state until then; no sample community content is written to production.

Validation:

```powershell
node node_modules/tsx/dist/cli.mjs --test tests/community.test.ts
npm run test:community
```

The Community integration suite uses only the local Firestore emulator and a demo project. It exercises authorization, concurrent retry handling, notifications, reporting, moderation, private fields, direct-access security rules, pagination, and ownership of the found action.
