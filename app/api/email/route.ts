import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import {
  welcomeEmail,
  purchaseReceiptEmail,
  payoutEmail,
  subscriptionConfirmationEmail,
} from '@/lib/email/templates';

const FROM = 'AfroBooks <noreply@afrobooks.com>';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, to, data } = body;

  if (!type || !to) {
    return NextResponse.json({ error: 'Missing type or to' }, { status: 400 });
  }

  let email: { subject: string; html: string };

  switch (type) {
    case 'welcome':
      email = welcomeEmail(data.firstName);
      break;
    case 'receipt':
      email = purchaseReceiptEmail(data);
      break;
    case 'payout':
      email = payoutEmail(data);
      break;
    case 'subscription':
      email = subscriptionConfirmationEmail(data);
      break;
    default:
      return NextResponse.json({ error: 'Unknown email type' }, { status: 400 });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: FROM, to, subject: email.subject, html: email.html });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Email send error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
