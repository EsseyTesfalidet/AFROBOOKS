import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument from '@/components/legal/LegalDocument';
import { LEGAL_CONTACT } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of use',
  description:
    'Your guide to reading, publishing, payments, author earnings and book promotions on AfroBooks.',
  alternates: { canonical: 'https://afrobs.com/terms' },
};

export default function TermsPage() {
  return (
    <LegalDocument
      kind="terms"
      title="Terms of use"
      introduction="A shared understanding for readers and authors. These terms explain how AfroBooks works, what you can expect, and the responsibilities that come with using it."
      highlights={[
        {
          title: 'Your stories remain yours',
          text: 'Authors retain their rights. Readers receive personal access to the books they buy or borrow.',
        },
        {
          title: 'Know what you’re paying',
          text: 'Review the price and any recurring billing before checkout. Author earnings and promotions have separate terms.',
        },
        {
          title: 'Help when something goes wrong',
          text: 'Contact us about access problems, duplicate charges, copyright concerns or your account.',
        },
      ]}
      sections={[
        {
          id: 'using-afrobooks',
          title: 'Using AfroBooks',
          content: (
            <>
              <p>
                These terms apply to AfroBooks at afrobs.com, including its reader, author tools and
                book promotions. To use an account, you must accept these terms and acknowledge our{' '}
                <Link href="/privacy">Privacy information</Link>. We record the document versions
                and acceptance date. Acknowledging the privacy notice is not consent to unrelated
                marketing.
              </p>
              <p>
                You must be at least 13, or the higher minimum age required where you live. If you
                are below the age of legal adulthood, use the service with a parent or guardian’s
                permission and supervision. Publishing, making purchases and receiving payouts
                require the legal authority to enter the relevant agreements.
              </p>
            </>
          ),
        },
        {
          id: 'your-account',
          title: 'Your account',
          content: (
            <>
              <p>
                Provide accurate information, keep your sign-in details secure, and let us know if
                you suspect unauthorized access. Do not impersonate others, sell account access, or
                use another person’s payment or identity details without authorization.
              </p>
              <p>
                You can edit your profile and manage account security in settings. You remain
                responsible for content you submit and activity you authorize.
              </p>
            </>
          ),
        },
        {
          id: 'reading-and-access',
          title: 'Reading and book access',
          content: (
            <>
              <p>
                A purchase gives you a personal, non-transferable license to read the book through
                AfroBooks. A borrow or subscription provides access under the duration and
                eligibility shown in the app. Neither transfers copyright or grants permission to
                redistribute, resell, or bypass access controls, except where applicable law
                permits.
              </p>
              <p>
                Reading progress and device preferences help you resume a book; synchronization
                depends on your connection. Availability can change if a book is removed, an account
                is deleted, or legal or safety concerns arise. If a purchased book becomes
                inaccessible, contact support with the order reference so we can review access or a
                refund. We do not promise permanent hosting or downloadable copies.
              </p>
            </>
          ),
        },
        {
          id: 'payments',
          title: 'Purchases, billing and refunds',
          content: (
            <>
              <p>
                Review the total, currency, discounts and any stated taxes before confirming
                checkout. Book prices reflect the author’s earnings, the platform’s share and
                estimated payment-processing costs. Stripe processes payments; your bank may apply
                its own conversion or other fees.
              </p>
              <p>
                For access failures, duplicate charges or other purchase problems, contact{' '}
                <a href={`mailto:${LEGAL_CONTACT}?subject=Purchase%20support`}>{LEGAL_CONTACT}</a>{' '}
                with your order reference. We review the circumstances and any refund rights that
                apply where you live. Nothing in these terms excludes mandatory consumer rights,
                statutory remedies or cancellation rights. Do not send card numbers or bank details
                by email.
              </p>
            </>
          ),
        },
        {
          id: 'subscriptions',
          title: 'Subscriptions',
          content: (
            <>
              <p>
                If you choose a recurring plan, the billing amount and interval are shown before
                payment. It renews until canceled. Use the subscription controls in your profile to
                cancel future renewal and check your access end date. Contact support if you cannot
                reach those controls.
              </p>
              <p>
                Cancellation does not by itself refund a previous charge. Access and refund rights
                follow the plan you accepted and applicable law. Subscription borrowing applies to
                eligible books and does not transfer ownership of the catalog.
              </p>
            </>
          ),
        },
        {
          id: 'publishing',
          title: 'Publishing and content rights',
          content: (
            <>
              <p>
                You retain ownership of your original work. By uploading a book, cover, description
                or other content, you confirm that you have the necessary rights and permissions,
                including permission for third-party material.
              </p>
              <p>
                You give AfroBooks a non-exclusive license to store, process, display and deliver
                that content to operate the service, show previews and catalog listings, and carry
                out promotions you request. This license is limited to those purposes and ends when
                the content is removed, except for records or copies needed to complete existing
                obligations, maintain backups or meet legal requirements.
              </p>
              <p>
                Public reviews and profile material must also be yours to share. Report suspected
                infringement with the work involved, its AfroBooks link, an explanation of your
                rights and a way to contact you. We may request further information before acting.
              </p>
            </>
          ),
        },
        {
          id: 'author-earnings',
          title: 'Author earnings and Stripe',
          content: (
            <>
              <p>
                Authors must complete Stripe onboarding before their books can accept paid
                purchases. Country availability, identity checks, account eligibility and bank
                payout timing are determined by Stripe’s requirements. Stripe’s{' '}
                <a href="https://stripe.com/legal/connect-account">Connected Account Agreement</a>{' '}
                also applies to its payment services.
              </p>
              <p>
                The publishing tools show the intended author share and retail-price estimate.
                Earnings recorded for a completed order reflect the accepted price, discounts and
                applicable platform and processing allocation. A transfer to your Stripe balance is
                separate from a payout to your bank; settlement, conversion and payout schedules can
                affect when and how much reaches your bank.
              </p>
              <p>
                Refunds, disputes, reversals, inconsistent records or verification issues can delay
                or place earnings under review. We do not guarantee an earnings amount or payout
                date. Authors are responsible for accurate payout and tax information and their
                applicable tax obligations.
              </p>
            </>
          ),
        },
        {
          id: 'book-promotions',
          title: 'Book promotions',
          content: (
            <>
              <p>
                Promotions are optional, clearly labeled placements for eligible published books in
                Discover. The offer shown at submission states the one-time price, including any
                free pilot, and duration. Promotions require approval and do not renew
                automatically.
              </p>
              <p>
                A free campaign starts on approval; a paid campaign starts after approval and
                confirmed payment. Placements are shared with other eligible books. We do not
                guarantee views, clicks, sales or a return on spending. Results are approximate
                daily signed-in reader counts, not independently audited reach or sales attribution.
              </p>
              <p>
                Removed, changed or ineligible books stop appearing. You can stop a campaign from
                its workspace. A stopped paid campaign enters payment review; contact support about
                refunds. Promotion fees are separate from book-sale commissions and do not generate
                author royalties. The accepted offer and your applicable consumer rights remain
                relevant to any review.
              </p>
            </>
          ),
        },
        {
          id: 'community-and-safety',
          title: 'Community and safety',
          content: (
            <>
              <p>
                Do not use AfroBooks for fraud, harassment, infringement, illegal content,
                manipulated reviews or promotion metrics, malicious uploads, or attempts to access
                other people’s accounts or private data. Do not evade payment, security or
                publishing restrictions.
              </p>
              <p>
                We may review reports, restrict content, pause payments or suspend accounts to
                address violations, legal obligations or security concerns. Contact support if you
                believe a decision is mistaken. Publication or an author badge is not a guarantee of
                a book’s accuracy or suitability.
              </p>
            </>
          ),
        },
        {
          id: 'privacy',
          title: 'Privacy and account deletion',
          content: (
            <>
              <p>
                Our dedicated <Link href="/privacy">Privacy information</Link> covers account data,
                reading activity, Stripe, service providers and your choices.
              </p>
              <p>
                You can request account deletion from settings. Deletion removes sign-in and library
                access, and removes an author’s books. Financial, dispute, security and necessary
                compliance records may remain. Deleting AfroBooks does not automatically close a
                separate Stripe account or erase records Stripe must retain. Contact support before
                deletion if you have unresolved earnings or a payment dispute.
              </p>
            </>
          ),
        },
        {
          id: 'service-and-rights',
          title: 'Service availability and your rights',
          content: (
            <>
              <p>
                We work to keep AfroBooks available and secure, but interruptions and errors can
                occur. Content and features may change. Except for rights or guarantees that cannot
                legally be excluded, the service is provided as available without a promise of
                uninterrupted access or specific results.
              </p>
              <p>
                To the extent allowed by applicable law, AfroBooks is not responsible for indirect
                or consequential losses. This does not limit liability that cannot lawfully be
                excluded, including mandatory consumer protections. These terms do not require you
                to give up rights or remedies under the laws that apply to you.
              </p>
            </>
          ),
        },
        {
          id: 'changes-and-contact',
          title: 'Updates and contact',
          content: (
            <>
              <p>
                The date above identifies this version. We ask you to review and accept a new
                version when renewed agreement is required. Changes do not override the terms of an
                already completed purchase or promotion except where law permits.
              </p>
              <p>
                For questions, complaints, copyright reports or account help, contact AfroBooks at{' '}
                <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>. Include the relevant book,
                order or campaign reference, and avoid sending passwords, full payment details or
                identity documents.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
