import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument from '@/components/legal/LegalDocument';
import { LEGAL_CONTACT } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy information',
  description:
    'How AfroBooks handles account information, reading activity, payments and author payouts, and how to manage your data.',
  alternates: { canonical: 'https://afrobs.com/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      kind="privacy"
      title="Your privacy, explained"
      introduction="The information you share helps us deliver your books, remember your place and pay authors. Here is what AfroBooks handles, why we use it, and the choices available to you."
      highlights={[
        {
          title: 'A private reading space',
          text: 'Your library and reading progress are not published on your public profile.',
        },
        {
          title: 'Payment details go to Stripe',
          text: 'Stripe collects payment, identity and bank details. AfroBooks keeps the references and status needed to operate payments.',
        },
        {
          title: 'Clear ways to take control',
          text: 'Edit your profile, manage device settings, delete your account or contact us about your information.',
        },
      ]}
      sections={[
        {
          id: 'scope',
          title: 'Who this information covers',
          content: (
            <>
              <p>
                This privacy information describes AfroBooks at afrobs.com, including browsing,
                reading, publishing, purchases and book promotions. It applies to visitors, readers
                and authors. Contact AfroBooks at{' '}
                <a href={`mailto:${LEGAL_CONTACT}?subject=Privacy%20request`}>{LEGAL_CONTACT}</a>{' '}
                for privacy questions or requests.
              </p>
              <p>
                Stripe and other service providers also describe their handling of information in
                their own policies. Our <Link href="/terms">Terms of use</Link> describe the service
                agreement.
              </p>
            </>
          ),
        },
        {
          id: 'information-collected',
          title: 'Information we handle',
          content: (
            <ul>
              <li>
                <strong>Account and profile:</strong> name, email, account identifier, sign-in
                provider, username, avatar and information you choose to provide, such as a
                biography, genre preference or author links. We record the versions of the terms and
                privacy notice you accepted or acknowledged, with the date.
              </li>
              <li>
                <strong>Reading and activity:</strong> library and purchase records, borrowing,
                saved books, reading progress, follows, reviews and reader preferences. Some
                preferences and recent positions are stored on your device.
              </li>
              <li>
                <strong>Author information:</strong> manuscripts, covers, descriptions, publishing
                settings, verification submissions, tax-form type and status, earnings records and
                Stripe account references and readiness.
              </li>
              <li>
                <strong>Transactions:</strong> orders, subscriptions, discounts, amounts, currency,
                payment references, refunds, disputes, royalty transfers and bank-payout status
                received from Stripe. Full card numbers and bank account details are collected by
                Stripe, not stored in the AfroBooks application database.
              </li>
              <li>
                <strong>Support and technical records:</strong> messages or reports you send,
                security and error records, request details and device or connection information
                processed by our hosting and authentication providers.
              </li>
            </ul>
          ),
        },
        {
          id: 'how-used',
          title: 'Why we use information',
          content: (
            <>
              <p>
                We use information to create and secure accounts, provide access to books, save
                progress, personalize catalog suggestions, fulfill purchases, administer
                subscriptions, pay authors, review publications and promotions, respond to requests
                and investigate abuse or payment problems.
              </p>
              <p>
                We also reconcile payments, prevent duplicate transactions, maintain the service and
                meet applicable obligations. Where a legal basis is required, it may be providing
                the service you request, a legal obligation, a legitimate interest such as security
                or service operation, or consent when required. You can contact us about a
                particular use or withdraw consent for a consent-based use. Acknowledging this
                notice does not authorize unrelated marketing.
              </p>
            </>
          ),
        },
        {
          id: 'public-information',
          title: 'What other people can see',
          content: (
            <>
              <p>
                Published book titles, covers, descriptions, previews, author names and public
                author profiles are visible to readers. Reviews can show your name, avatar, rating
                and review text. Choose carefully what you include; public content may be indexed by
                search engines or copied by others.
              </p>
              <p>
                Your library and reading progress are not displayed as a public profile. Authors and
                authorized administrators can access sales, earnings or account information needed
                for their role. Authors see promotion totals rather than a list of readers who
                viewed or clicked a placement.
              </p>
            </>
          ),
        },
        {
          id: 'service-providers',
          title: 'Services that help us operate',
          content: (
            <>
              <p>Information is processed by services that provide specific parts of AfroBooks:</p>
              <ul>
                <li>
                  <strong>Google Firebase:</strong> authentication, application records and file
                  storage. Google sign-in supplies profile information to create or access your
                  account. See{' '}
                  <a href="https://policies.google.com/privacy">Google’s privacy policy</a>.
                </li>
                <li>
                  <strong>Stripe:</strong> checkout, subscriptions, fraud and dispute handling,
                  connected-account verification, author transfers and bank payouts. Stripe sends us
                  the references, eligibility and transaction status needed to operate these
                  features. See <a href="https://stripe.com/privacy">Stripe’s privacy policy</a>.
                </li>
                <li>
                  <strong>Vercel:</strong> website hosting, request handling and operational logs.
                  See <a href="https://vercel.com/legal/privacy-policy">Vercel’s privacy policy</a>.
                </li>
                <li>
                  <strong>Resend:</strong> service email delivery where enabled, including receipts
                  and subscription messages. This can include your email, name and transaction
                  details shown in the message. See{' '}
                  <a href="https://resend.com/legal/privacy-policy">Resend’s privacy policy</a>.
                </li>
              </ul>
              <p>
                We may also disclose information when legally required, to address fraud or security
                issues, or to establish or defend legal claims. Providers may process information in
                the United States or other countries. Protections and rights can differ by location;
                contact us about a specific processing or transfer question.
              </p>
            </>
          ),
        },
        {
          id: 'device-storage',
          title: 'Cookies and device storage',
          content: (
            <>
              <p>
                Authentication cookies and browser storage support sign-in, account navigation,
                reading appearance and saved reading positions. Browser storage may also retain
                temporary cart or interface state. These features can stop working if storage is
                blocked.
              </p>
              <p>
                You can clear cookies and site data through your browser. This can sign you out and
                remove unsynced reading positions or local preferences; it does not delete records
                already saved to your account. On a shared device, sign out when finished and clear
                site data if needed.
              </p>
            </>
          ),
        },
        {
          id: 'promotions',
          title: 'Book promotions and measurement',
          content: (
            <>
              <p>
                Discover can show placements labeled as sponsored author promotions. This feature
                does not use a third-party advertising network or cross-site advertising cookies.
              </p>
              <p>
                For signed-in readers, we record whether a campaign was viewed or clicked using a
                hashed combination of campaign, date and account identifier. Each account is counted
                at most once per day for each event type. Authors’ own visits are excluded;
                anonymous visitors are not included. The markers are pseudonymous, not a claim of
                complete anonymity.
              </p>
              <p>
                Authors receive aggregate counts. Event markers remain with campaign records to
                support deduplication and review; they are not automatically erased each day.
                Promotion financial records are kept separately from reading progress.
              </p>
            </>
          ),
        },
        {
          id: 'retention-and-deletion',
          title: 'Retention and account deletion',
          content: (
            <>
              <p>
                We keep records while needed to provide the service, support payments, resolve
                disputes, prevent abuse or meet applicable recordkeeping requirements. The period
                depends on the record and purpose; backups and provider logs may have separate
                retention periods.
              </p>
              <p>
                Settings include an account-deletion request. Deletion removes your account and
                associated library, reading-progress and profile records; for authors, it removes
                their books. Order, payment, payout, campaign, agreement and dispute records may
                remain for reconciliation, legal obligations and security. Deletion removes access
                to purchased books and cannot be undone.
              </p>
              <p>
                Deleting AfroBooks does not automatically close your Stripe account or delete
                information Stripe must retain. Clearing browser data is a separate step. Contact us
                about access, correction or deletion, including information remaining after account
                closure.
              </p>
            </>
          ),
        },
        {
          id: 'your-choices',
          title: 'Your choices and requests',
          content: (
            <>
              <p>
                You can edit available profile fields, change reading appearance, manage your
                subscription and request account deletion through settings. Contact{' '}
                <a href={`mailto:${LEGAL_CONTACT}?subject=Privacy%20request`}>{LEGAL_CONTACT}</a> to
                ask about the personal information we hold or request access, correction or
                deletion.
              </p>
              <p>
                Depending on where you live, you may have additional rights, including a copy of
                your information, portability, restriction, objection, withdrawal of consent or a
                complaint to your local data-protection authority. We consider requests under
                applicable rules and may need to verify your identity. Some financial, legal or
                security records may be exempt from deletion.
              </p>
              <p>
                Send the request from your account email when possible. Do not include passwords,
                full payment details or identity documents in an initial email.
              </p>
            </>
          ),
        },
        {
          id: 'security-and-younger-users',
          title: 'Security and younger users',
          content: (
            <>
              <p>
                We use authenticated access and role-based permissions to limit access to private
                records, and rely on providers for secure hosting and payment processing. No online
                service can guarantee absolute security. Keep credentials private and report
                suspected misuse promptly.
              </p>
              <p>
                AfroBooks is not intended for children under 13 or a higher applicable minimum age.
                If you believe a child below that age has provided personal information, contact us
                to investigate and address it. The service does not provide a dedicated children’s
                account or parental-consent flow.
              </p>
            </>
          ),
        },
        {
          id: 'privacy-updates',
          title: 'Updates to this information',
          content: (
            <>
              <p>
                We update this page when our practices or service change and show the revision date
                at the top. We request a new acknowledgment when the version changes, and provide
                additional notice or seek consent where required. Contact us if an explanation is
                unclear or you need help exercising a privacy choice.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
