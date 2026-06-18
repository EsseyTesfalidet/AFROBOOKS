import { Resend } from 'resend';
import {
  purchaseReceiptEmail,
  subscriptionConfirmationEmail,
} from '@/lib/email/templates';

const FROM = 'AfroBooks <noreply@afrobooks.com>';

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function sendPurchaseReceiptEmail(params: {
  to: string;
  buyerName: string;
  items: { title: string; authorName: string; priceCents: number }[];
  totalCents: number;
  orderId: string;
}) {
  const resend = getResend();
  if (!resend) return false;

  const email = purchaseReceiptEmail({
    buyerName: params.buyerName,
    items: params.items,
    totalCents: params.totalCents,
    orderId: params.orderId,
  });

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: email.subject,
    html: email.html,
  });

  return true;
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
