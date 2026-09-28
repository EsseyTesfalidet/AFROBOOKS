export interface ReminderEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

export function payoutReminderEmail(input: {
  from: string; to: string; name: string; appUrl: string; followup: boolean;
}): ReminderEmail {
  const base = new URL(input.appUrl);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Invalid reminder app URL');
  const url = new URL('/dashboard?profile=payout', base.origin).href;
  const subject = input.followup
    ? 'Reminder: finish your AfroBooks payout setup'
    : 'Finish setting up your AfroBooks author payments';
  const message = 'Readers cannot purchase your books until your Stripe payout setup is complete. Open your Payouts settings to securely provide the required information.';
  const footer = 'Enter your bank and identity details only through Stripe. Do not reply with financial information. This is an account setup reminder, not a promotional email.';
  return {
    from: input.from, to: input.to, subject,
    text: `Hello ${input.name || 'Author'},\n\n${message}\n\nComplete payout setup: ${url}\n\n${footer}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#222"><h1 style="color:#d7472c">AfroBooks</h1><h2>${subject}</h2><p>Hello ${escapeHtml(input.name || 'Author')},</p><p>${message}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#d7472c;color:white;padding:14px 20px;border-radius:8px;text-decoration:none">Complete payout setup</a></p><p style="font-size:12px;color:#666">${footer}</p></div>`,
  };
}

// Check the provider's response: an HTTP request completing is not proof of acceptance.
export async function sendReminderEmail(apiKey: string, email: ReminderEmail, key: string): Promise<string> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(email),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Reminder email provider returned ${response.status}`);
  const result = await response.json() as { id?: string };
  if (!result.id || typeof result.id !== 'string') throw new Error('Reminder email acceptance not confirmed');
  return result.id;
}
