export function welcomeEmail(firstName: string): { subject: string; html: string } {
  return {
    subject: 'Welcome to AfroBooks',
    html: `
      <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;background:#0e0e0e;color:#f5f2eb;padding:40px 32px;border-radius:16px;">
        <h1 style="font-size:28px;font-weight:700;color:#e8442a;margin:0 0 8px;">AfroBooks</h1>
        <p style="color:#555;font-size:13px;margin:0 0 32px;">The African Ebook Marketplace</p>
        <h2 style="font-size:20px;color:#f5f2eb;margin:0 0 12px;">Welcome, ${firstName}!</h2>
        <p style="color:#aaa;line-height:1.7;">You're now part of AfroBooks — the marketplace celebrating African authors and stories. Discover thousands of ebooks across every genre.</p>
        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/browse" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#e8442a;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Browse Books</a>
        <p style="margin-top:32px;color:#444;font-size:12px;">AfroBooks · US-registered marketplace for African authors</p>
      </div>
    `,
  };
}

export function purchaseReceiptEmail(params: {
  buyerName: string;
  items: { title: string; authorName: string; priceCents: number }[];
  totalCents: number;
  orderId: string;
}): { subject: string; html: string } {
  const formatCents = (c: number) => `$${(c / 100).toFixed(2)}`;
  const itemRows = params.items.map((i) => `
    <tr>
      <td style="padding:8px 0;color:#f5f2eb;">${i.title}</td>
      <td style="padding:8px 0;color:#aaa;font-size:13px;">${i.authorName}</td>
      <td style="padding:8px 0;color:#f5b800;text-align:right;">${formatCents(i.priceCents)}</td>
    </tr>
  `).join('');

  return {
    subject: `Your AfroBooks receipt — Order #${params.orderId.slice(-6).toUpperCase()}`,
    html: `
      <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;background:#0e0e0e;color:#f5f2eb;padding:40px 32px;border-radius:16px;">
        <h1 style="font-size:28px;font-weight:700;color:#e8442a;margin:0 0 8px;">AfroBooks</h1>
        <p style="color:#555;font-size:13px;margin:0 0 32px;">Order Confirmation</p>
        <h2 style="font-size:18px;color:#f5f2eb;margin:0 0 4px;">Thanks, ${params.buyerName}!</h2>
        <p style="color:#aaa;font-size:13px;">Order #${params.orderId.slice(-6).toUpperCase()}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:24px;">
          <thead>
            <tr style="border-bottom:1px solid #1a1a1a;">
              <th style="text-align:left;padding:8px 0;color:#555;font-size:11px;font-weight:600;text-transform:uppercase;">Book</th>
              <th style="text-align:left;padding:8px 0;color:#555;font-size:11px;font-weight:600;text-transform:uppercase;">Author</th>
              <th style="text-align:right;padding:8px 0;color:#555;font-size:11px;font-weight:600;text-transform:uppercase;">Price</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr style="border-top:1px solid #1a1a1a;">
              <td colspan="2" style="padding:12px 0;font-weight:600;color:#f5f2eb;">Total</td>
              <td style="padding:12px 0;color:#f5b800;font-weight:700;text-align:right;">${formatCents(params.totalCents)}</td>
            </tr>
          </tfoot>
        </table>
        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/library" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#e8442a;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Read in Library</a>
        <p style="margin-top:32px;color:#444;font-size:12px;">AfroBooks · This is an automated receipt.</p>
      </div>
    `,
  };
}

export function payoutEmail(params: {
  sellerName: string;
  amountCents: number;
  periodLabel: string;
}): { subject: string; html: string } {
  const formatCents = (c: number) => `$${(c / 100).toFixed(2)}`;
  return {
    subject: `AfroBooks Payout — ${formatCents(params.amountCents)} sent`,
    html: `
      <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;background:#0e0e0e;color:#f5f2eb;padding:40px 32px;border-radius:16px;">
        <h1 style="font-size:28px;font-weight:700;color:#e8442a;margin:0 0 8px;">AfroBooks</h1>
        <p style="color:#555;font-size:13px;margin:0 0 32px;">Author Payout</p>
        <h2 style="font-size:18px;color:#f5f2eb;margin:0 0 12px;">Your payout is on its way, ${params.sellerName}!</h2>
        <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px 24px;margin-top:16px;">
          <p style="color:#555;font-size:12px;margin:0 0 4px;">Amount</p>
          <p style="font-size:32px;font-weight:700;color:#f5b800;margin:0;">${formatCents(params.amountCents)}</p>
          <p style="color:#555;font-size:12px;margin:8px 0 0;">Period: ${params.periodLabel}</p>
        </div>
        <p style="color:#aaa;font-size:13px;margin-top:20px;line-height:1.7;">Funds will arrive in your connected Stripe account within 2-5 business days.</p>
        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/seller/earnings" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#e8442a;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">View Earnings</a>
        <p style="margin-top:32px;color:#444;font-size:12px;">AfroBooks · This is an automated message.</p>
      </div>
    `,
  };
}

export function subscriptionConfirmationEmail(params: {
  userName: string;
  plan: 'basic' | 'standard' | 'premium';
  amountCents: number;
}): { subject: string; html: string } {
  const formatCents = (c: number) => `$${(c / 100).toFixed(2)}`;
  const planLabel = params.plan.charAt(0).toUpperCase() + params.plan.slice(1);
  return {
    subject: `AfroBooks ${planLabel} subscription confirmed`,
    html: `
      <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;background:#0e0e0e;color:#f5f2eb;padding:40px 32px;border-radius:16px;">
        <h1 style="font-size:28px;font-weight:700;color:#e8442a;margin:0 0 8px;">AfroBooks</h1>
        <p style="color:#555;font-size:13px;margin:0 0 32px;">Subscription Confirmation</p>
        <h2 style="font-size:18px;color:#f5f2eb;margin:0 0 12px;">You're subscribed, ${params.userName}!</h2>
        <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px 24px;margin-top:16px;">
          <p style="color:#555;font-size:12px;margin:0 0 4px;">Plan</p>
          <p style="font-size:24px;font-weight:700;color:#f5b800;margin:0;">${planLabel}</p>
          <p style="color:#555;font-size:12px;margin:8px 0 0;">${formatCents(params.amountCents)}/month · Auto-renews monthly</p>
        </div>
        <p style="color:#aaa;font-size:13px;margin-top:20px;line-height:1.7;">You now have full access to the AfroBooks subscription library. Dive in and start reading.</p>
        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/browse?tab=subscription" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#e8442a;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Browse Subscription Books</a>
        <p style="margin-top:32px;color:#444;font-size:12px;">AfroBooks · Manage your subscription at any time from your account settings.</p>
      </div>
    `,
  };
}
