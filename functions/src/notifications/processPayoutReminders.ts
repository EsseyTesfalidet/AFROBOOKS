import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { defineString } from 'firebase-functions/params';
import Stripe from 'stripe';
import { processAuthorPayoutReminder } from './authorPayoutReminders';
import { sendReminderEmail } from './payoutReminderEmail';

const appUrl = defineString('PAYOUT_REMINDER_APP_URL', { default: 'https://afrobs.com' });
const emailFrom = defineString('PAYOUT_REMINDER_EMAIL_FROM', { default: 'AfroBooks <noreply@afrobooks.com>' });

export const processAuthorPayoutReminders = functions
  .runWith({ secrets: ['STRIPE_SECRET_KEY', 'RESEND_API_KEY'], timeoutSeconds: 540, maxInstances: 1 })
  .pubsub.schedule('every 60 minutes').timeZone('UTC').onRun(async () => {
    const key = process.env.STRIPE_SECRET_KEY ?? '';
    if (!/^(sk|rk)_live_/.test(key)) throw new Error('Live Stripe reminder credentials are not configured');
    const db = admin.firestore();
    const stripe = new Stripe(key, { apiVersion: '2023-10-16', timeout: 20000, maxNetworkRetries: 1 });
    const resendKey = process.env.RESEND_API_KEY;
    const gateway = {
      account: (id: string) => stripe.accounts.retrieve(id),
      sendEmail: resendKey ? (email: Parameters<typeof sendReminderEmail>[1], id: string) => sendReminderEmail(resendKey, email, id) : undefined,
      appUrl: appUrl.value(), from: emailFrom.value(),
    };
    if (!resendKey) console.warn('Payout reminder emails pending: Resend is not configured. In-app reminders remain enabled.');
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let processed = 0;
    let failed = 0;
    do {
      const query = db.collection('sellers').orderBy(admin.firestore.FieldPath.documentId()).limit(100);
      const page = await (cursor ? query.startAfter(cursor) : query).get();
      if (page.empty) break;
      for (const seller of page.docs) {
        try {
          await processAuthorPayoutReminder(db, seller.id, gateway);
          processed++;
        } catch {
          failed++;
          console.error('Author payout reminder deferred; inspect reminder delivery state', { sellerId: seller.id });
        }
      }
      cursor = page.docs[page.docs.length - 1];
    } while (cursor);
    console.log('Author payout reminder check completed', { processed, failed });
    return null;
  });
