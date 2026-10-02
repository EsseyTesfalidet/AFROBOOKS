import { Resend } from 'resend';
import { subscriptionConfirmationEmail } from '@/lib/email/templates';

const FROM = 'AfroBooks <noreply@afrobooks.com>';

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function sendSubscriptionConfirmation(params: {
  to: string;
  userName: string;
  plan: 'basic' | 'standard' | 'premium';
  amountCents: number;
}) {
  const resend = getResend();
  if (!resend) return false;

  const email = subscriptionConfirmationEmail({
    userName: params.userName,
    plan: params.plan,
    amountCents: params.amountCents,
  });

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: email.subject,
    html: email.html,
  });

  return true;
}
