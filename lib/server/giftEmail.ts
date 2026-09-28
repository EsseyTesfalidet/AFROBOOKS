import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { sendReminderEmail, type ReminderEmail } from '../../functions/src/notifications/payoutReminderEmail';

export function giftEmailConfiguration(env: Record<string, string | undefined> = process.env) {
  try {
    const url = new URL(env.NEXT_PUBLIC_APP_URL ?? '');
    if (!env.RESEND_API_KEY || url.protocol !== 'https:' || url.username || url.password) return null;
    return { appUrl: url.origin, apiKey: env.RESEND_API_KEY, from: env.GIFT_EMAIL_FROM || 'AfroBooks <noreply@afrobooks.com>' };
  } catch { return null; }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function bookGiftEmail(input: { from: string; to: string; senderName: string; bookTitle: string; message: string; url: string }): ReminderEmail {
  const intro = `${input.senderName} sent you "${input.bookTitle}" on AfroBooks.`;
  const instructions = 'Sign in or create an account with this email address, verify your email, and claim your book. There is no charge to claim it.';
  return {
    from: input.from, to: input.to, subject: 'Someone sent you a book on AfroBooks',
    text: `${intro}\n\n${input.message ? `${input.message}\n\n` : ''}${instructions}\n\nOpen your gift: ${input.url}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#222"><h1>AfroBooks</h1><h2>A book for you</h2><p>${escapeHtml(intro)}</p>${input.message ? `<blockquote style="white-space:pre-wrap">${escapeHtml(input.message)}</blockquote>` : ''}<p>${instructions}</p><p><a href="${escapeHtml(input.url)}">Open your gift</a></p></div>`,
  };
}

export function giftClaimUrl(appUrl: string, token: string) {
  const url = new URL('/gifts/claim', appUrl);
  url.hash = `token=${token}`;
  return url.href;
}

// Persist a stable payload and lease before sending. Provider idempotency is
// valid for 24 hours; ambiguous older attempts require staff review.
export async function deliverBookGift(db: Firestore, giftId: string, options?: {
  config?: NonNullable<ReturnType<typeof giftEmailConfiguration>>;
  send?: typeof sendReminderEmail;
  now?: number;
}) {
  const config = options?.config ?? giftEmailConfiguration();
  if (!config) throw new Error('Gift email is not configured');
  const ref = db.collection('bookGifts').doc(giftId);
  const now = options?.now ?? Date.now();
  const leaseId = randomUUID();
  const attempt = await db.runTransaction(async tx => {
    const gift = (await tx.get(ref)).data();
    if (!gift || gift.status !== 'available' || ['sent', 'needs_review'].includes(gift.emailStatus)) return null;
    if (gift.emailLeaseUntil > now) throw new Error('Gift email is already being sent');
    if (gift.emailStartedAt && now - gift.emailStartedAt > 23 * 60 * 60 * 1000) {
      tx.update(ref, { emailStatus: 'needs_review' });
      return null;
    }
    const payload: ReminderEmail = gift.emailPayload ?? bookGiftEmail({
      from: config.from, to: gift.recipientEmail, senderName: gift.senderName, bookTitle: gift.bookTitle,
      message: gift.message, url: giftClaimUrl(config.appUrl, gift.claimToken),
    });
    tx.update(ref, { emailStatus: 'sending', emailLeaseId: leaseId, emailLeaseUntil: now + 60000, emailStartedAt: gift.emailStartedAt ?? now, emailPayload: payload });
    return payload;
  });
  if (!attempt) return;
  try {
    const providerId = await (options?.send ?? sendReminderEmail)(config.apiKey, attempt, `book-gift-${giftId}`);
    await db.runTransaction(async tx => {
      const gift = (await tx.get(ref)).data();
      if (gift?.emailLeaseId === leaseId) tx.update(ref, { emailStatus: 'sent', emailProviderId: providerId, emailSentAt: new Date(), emailLeaseUntil: 0 });
    });
  } catch {
    await db.runTransaction(async tx => {
      const gift = (await tx.get(ref)).data();
      if (gift?.emailLeaseId === leaseId) tx.update(ref, { emailStatus: 'failed', emailLeaseUntil: 0 });
    });
    throw new Error('Gift email has not been confirmed. Please retry or share the claim link.');
  }
}
