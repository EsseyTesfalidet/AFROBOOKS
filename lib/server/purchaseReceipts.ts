import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { purchaseReceiptEmail } from '@/lib/email/templates';
import { sendReminderEmail, type ReminderEmail } from '../../functions/src/notifications/payoutReminderEmail';

export function receiptEmailConfiguration(env: Record<string, string | undefined> = process.env) {
  return {
    apiKey: env.RESEND_API_KEY,
    from: env.RECEIPT_EMAIL_FROM || env.GIFT_EMAIL_FROM || 'AfroBooks <noreply@afrobooks.com>',
  };
}

/** Call only after verified fulfillment. A retry never charges or grants access. */
export async function deliverPurchaseReceipt(db: Firestore, paymentId: string, options?: {
  config?: ReturnType<typeof receiptEmailConfiguration>;
  send?: typeof sendReminderEmail;
  now?: number;
}) {
  const now = options?.now ?? Date.now();
  const config = options?.config ?? receiptEmailConfiguration();
  const ref = db.collection('purchaseReceiptEmails').doc(paymentId);
  const leaseId = randomUUID();
  const attempt = await db.runTransaction(async tx => {
    const [delivery, fulfillment, orders] = await Promise.all([
      tx.get(ref), tx.get(db.collection('paymentFulfillments').doc(paymentId)),
      tx.get(db.collection('orders').where('stripePaymentIntentId', '==', paymentId)),
    ]);
    const previous = delivery.data();
    if (previous?.status === 'sent') return null;
    const sale = fulfillment.data();
    // Never email a pending, failed, refunded, or disputed purchase as completed.
    if (!sale || sale.status === 'needs_review' || orders.empty || orders.docs.some(doc => doc.data().status !== 'completed')) return null;
    if (orders.docs.every(doc => doc.data().receiptEmailSent)) return null; // legacy receipts
    const total = orders.docs.reduce((sum, doc) => sum + doc.data().finalPrice, 0);
    if (!Number.isSafeInteger(total) || total < 0 || total !== sale.amount || orders.docs.some(doc => doc.data().buyerId !== sale.userId)) throw new Error('Receipt order mismatch');
    if (previous?.leaseUntil > now) throw new Error('Receipt delivery in progress');
    // An ambiguous send older than the provider's deduplication window needs
    // investigation, not another potentially duplicate email.
    if (previous?.startedAt && now - previous.startedAt >= 23 * 60 * 60 * 1000) {
      tx.set(ref, { status: 'needs_review', leaseUntil: 0 }, { merge: true });
      return { review: true as const };
    }
    if (!config.apiKey) throw new Error('Receipt email is not configured');
    const buyer = (await tx.get(db.collection('users').doc(sale.userId))).data();
    if (!buyer?.email) throw new Error('Receipt recipient missing');
    const orderDocs = [...orders.docs].sort((a, b) => a.id.localeCompare(b.id));
    const email = purchaseReceiptEmail({
      buyerName: [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || 'Reader',
      items: orderDocs.map(doc => ({ title: doc.data().bookTitle, authorName: doc.data().authorName ?? 'Unknown Author', priceCents: doc.data().finalPrice })),
      totalCents: total, orderId: paymentId, isGift: orderDocs.some(doc => !!doc.data().giftId),
    });
    const saved: ReminderEmail = previous?.payload ?? { ...email, from: config.from, to: buyer.email };
    // Firestore can reorder map keys. Rebuild a fixed field order so retry
    // request bytes stay identical as well as their parsed values.
    const payload: ReminderEmail = { from: saved.from, to: saved.to, subject: saved.subject, text: saved.text, html: saved.html };
    const orderIds = orderDocs.map(doc => doc.id);
    tx.set(ref, { status: 'sending', startedAt: previous?.startedAt ?? now, leaseId, leaseUntil: now + 60000, payload, orderIds }, { merge: true });
    return { review: false as const, payload, orderIds };
  });
  if (!attempt) return;
  if (attempt.review) throw new Error('Receipt delivery needs review');
  try {
    const providerId = await (options?.send ?? sendReminderEmail)(config.apiKey!, attempt.payload, `book-receipt-${paymentId}`);
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.leaseId !== leaseId) throw new Error('Receipt lease changed');
      tx.update(ref, { status: 'sent', providerId, sentAt: new Date(now), leaseUntil: 0 });
      for (const id of attempt.orderIds) tx.update(db.collection('orders').doc(id), { receiptEmailSent: true });
    });
  } catch {
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.leaseId === leaseId) tx.update(ref, { status: 'failed', leaseUntil: 0 });
    });
    throw new Error('Receipt email pending; retry required');
  }
}
