import Link from 'next/link';
import Logo from '@/components/shared/Logo';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 h-14 border-b" style={{ background: '#0e0e0e', borderColor: '#1a1a1a' }}>
        <Logo size="sm" href="/" />
        <Link href="/signup" className="text-sm px-4 py-1.5 rounded-lg font-medium" style={{ background: '#fff', color: '#000' }}>
          Back to Sign Up
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-display-lg text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-[#555] mb-10">Last updated: May 2025</p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ color: '#aaa' }}>

          <section>
            <h2 className="font-display text-lg text-white mb-3">1. Acceptance of Terms</h2>
            <p>By creating an account or using AfroBooks ("the Platform"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, do not use the Platform.</p>
          </section>

          <section>
            <h2 className="font-display text-lg text-white mb-3">2. Eligibility</h2>
            <p>You must be at least 13 years old to use AfroBooks. By registering, you confirm that all information you provide is accurate and that you have the legal capacity to enter into this agreement.</p>
          </section>

          <section>
            <h2 className="font-display text-lg text-white mb-3">3. Account Responsibilities</h2>
            <p className="mb-2">You are responsible for:</p>
            <ul className="space-y-1 list-disc pl-5">
              <li>Maintaining the confidentiality of your login credentials.</li>
              <li>All activity that occurs under your account.</li>
              <li>Notifying us immediately of any unauthorised access.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg text-white mb-3">4. Purchases & Payments</h2>
            <p className="mb-2">All purchases are final. Refunds may be issued at our discretion in cases of technical failure or duplicate charges. Prices are listed in USD. Payments are processed securely by Stripe.</p>
            <p>Subscription plans renew automatically until cancelled. You may cancel at any time from your profile settings.</p>
          </section>

          <section>
            <h2 className="font-display text-lg text-white mb-3">5. Intellectual Property</h2>
            <p>All ebooks and content on AfroBooks are owned by their respective authors. Purchasing or borrowing a book grants you a personal, non-transferable licence to read it. You may not copy, redistribute, or resell any content.</p>
          </section>

          <section>
            <h2 className="font-display text-lg text-white mb-3">6. Prohibited Conduct</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="space-y-1 list-disc pl-5">
              <li>Share your account or purchased content with others.</li>
              <li>Attempt to circumvent digital rights management or access controls.</li>
              <li>Post reviews or content that is defamatory, obscene, or infringing.</li>
              <li>Use the Platform for any unlawful purpose.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg text-white mb-3">7. Privacy</h2>
            <p>We collect and process your personal data in accordance with our Privacy Policy. We do not sell your data to third parties. We use Stripe for payment processing and Firebase for authentication and data storage.</p>
          </section>

          <section>
            <h2 className="font-display text-lg text-white mb-3">8. Termination</h2>
            <p>We reserve the right to suspend or terminate your account at any time if you violate these Terms. You may delete your account at any time from your profile settings.</p>
          </section>

          <section>
            <h2 className="font-display text-lg text-white mb-3">9. Limitation of Liability</h2>
            <p>AfroBooks is provided "as is". To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the Platform.</p>
          </section>

          <section>
            <h2 className="font-display text-lg text-white mb-3">10. Changes to Terms</h2>
            <p>We may update these Terms at any time. We will notify users of material changes via email or an in-app announcement. Continued use of the Platform after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="font-display text-lg text-white mb-3">11. Contact</h2>
            <p>For questions about these Terms, contact us at <span style={{ color: '#f5b800' }}>legal@afrobooks.com</span></p>
          </section>

        </div>
      </main>
    </div>
  );
}
