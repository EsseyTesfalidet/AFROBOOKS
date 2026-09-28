import type { Firestore } from 'firebase-admin/firestore';
import { accountReadiness, type ConnectedAccount } from '../stripe/accountReadiness';
import { payoutSetupState } from '../stripe/payoutSetupState';
import { payoutReminderEmail, type ReminderEmail } from './payoutReminderEmail';

export const FOLLOWUP_DELAY = 7 * 24 * 60 * 60 * 1000;
const EMAIL_LEASE = 10 * 60 * 1000;
const RETRY_WINDOW = 23 * 60 * 60 * 1000; // Resend retains idempotency keys for 24 hours.
const actionUrl = '/dashboard?profile=payout';
type Stage = 'initial' | 'followup';

export interface ReminderGateway {
  account(id: string): Promise<ConnectedAccount>;
  sendEmail?: (email: ReminderEmail, key: string) => Promise<string>;
  appUrl: string;
  from: string;
}

function eligible(user: FirebaseFirestore.DocumentData | undefined, seller: FirebaseFirestore.DocumentData | undefined) {
  return !!user && !!seller && ['seller', 'both', 'admin'].includes(user.role) &&
    ['active', 'warned'].includes(user.status) && !seller.payoutHoldReason &&
    !user.deletionPending && !seller.deletionPending;
}

export async function processAuthorPayoutReminder(
  db: Firestore, uid: string, gateway: ReminderGateway, now = Date.now(),
) {
  const sellerRef = db.doc(`sellers/${uid}`);
  const userRef = db.doc(`users/${uid}`);
  const stateRef = db.doc(`authorPayoutReminders/${uid}`);
  const [sellerSnapshot, userSnapshot] = await Promise.all([sellerRef.get(), userRef.get()]);
  const seller = sellerSnapshot.data();
  if (!eligible(userSnapshot.data(), seller)) return 'skipped';
  const accountId = seller!.stripeAccountId || null;
  // Always use Stripe's current state, not potentially stale Firestore readiness.
  const account = accountId ? await gateway.account(accountId) : null;
  if (account && (account.id !== accountId || account.metadata?.userId !== uid)) throw new Error('Reminder account ownership mismatch');
  const setup = payoutSetupState(account);
  const actionable = setup === 'needs_setup' || setup === 'needs_details';
  const stages: Stage[] = ['initial', 'followup'];
  const notificationRefs = stages.map(stage => db.doc(`notifications/payout_setup_${uid}_${stage}`));
  const reviewRef = db.doc(`notifications/payout_setup_${uid}_review`);

  const processed = await db.runTransaction(async tx => {
    const [latestUser, latestSeller, previous, review, ...notifications] = await Promise.all([
      tx.get(userRef), tx.get(sellerRef), tx.get(stateRef), tx.get(reviewRef), ...notificationRefs.map(ref => tx.get(ref)),
    ]);
    const user = latestUser.data();
    if (!eligible(user, latestSeller.data()) || (latestSeller.data()?.stripeAccountId || null) !== accountId) return false;
    const history = previous.data() ?? {};
    // Respect readiness refreshed by a concurrent onboarding request.
    const checkedAt = latestSeller.data()?.stripeAccountCheckedAt?.toMillis?.() ?? 0;
    if (checkedAt > now) return false;
    if (account) tx.update(sellerRef, { ...accountReadiness(account), stripeAccountCheckedAt: new Date(now) });
    tx.set(stateRef, { lastState: setup, checkedAt: now }, { merge: true });
    if (review.exists && setup !== 'reviewing') tx.update(reviewRef, {
      isRead: true, title: 'Stripe payout account updated',
      message: setup === 'ready' ? 'Your Stripe payout setup is complete.' : 'Stripe has updated your account. Open Payouts to check the latest requirements.',
    });

    if (!actionable) {
      for (const notification of notifications) {
        if (notification.exists) tx.update(notification.ref, {
          isRead: true,
          title: setup === 'ready' ? 'Payout setup complete' : 'Payout account status updated',
          message: setup === 'ready' ? 'Your Stripe payout setup is complete.'
            : setup === 'reviewing' ? 'Stripe is reviewing your payout account. Check Payouts for the latest status.'
              : 'Check your Payouts settings for the latest account status.',
        });
      }
      if (setup === 'reviewing' && !history.reviewNotified) {
        tx.create(reviewRef, {
          userId: uid, type: 'system', title: 'Stripe is reviewing your payout account',
          message: 'Stripe is reviewing your payout account. No new details are currently requested. You can check progress in Payouts.',
          isRead: false, actionUrl, relatedBookId: null, createdAt: new Date(now),
        });
        tx.set(stateRef, { reviewNotified: true }, { merge: true });
      }
      return true;
    }

    const stage: Stage | null = history.initialAt == null ? 'initial'
      : history.followupAt == null && now - history.initialAt >= FOLLOWUP_DELAY ? 'followup' : null;
    if (!stage) return true;
    const title = stage === 'initial' ? 'Finish setting up your author payments' : 'Reminder: finish your payout setup';
    tx.create(db.doc(`notifications/payout_setup_${uid}_${stage}`), {
      userId: uid, type: 'system', title,
      message: 'Readers cannot purchase your books until your Stripe payout setup is complete. Open Payouts to securely provide the required information.',
      isRead: false, actionUrl, relatedBookId: null, createdAt: new Date(now),
    });
    tx.set(stateRef, { [stage === 'initial' ? 'initialAt' : 'followupAt']: now }, { merge: true });
    if (typeof user!.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user!.email)) {
      tx.create(stateRef.collection('emails').doc(stage), {
        status: 'pending', createdAt: now,
        email: payoutReminderEmail({ from: gateway.from, to: user!.email,
          name: typeof user!.firstName === 'string' ? user!.firstName : 'Author',
          appUrl: gateway.appUrl, followup: stage === 'followup' }),
      });
    }
    return true;
  });
  if (!processed) return 'skipped';

  for (const stage of stages) {
    const emailRef = stateRef.collection('emails').doc(stage);
    const delivery = await db.runTransaction(async tx => {
      const [record, latestUser, latestSeller] = await Promise.all([tx.get(emailRef), tx.get(userRef), tx.get(sellerRef)]);
      const data = record.data();
      if (!data || ['sent', 'cancelled', 'needs_review'].includes(data.status)) return null;
      if (!eligible(latestUser.data(), latestSeller.data()) || latestUser.data()?.email !== data.email.to) {
        tx.update(emailRef, { status: 'cancelled' });
        return null;
      }
      if ((latestSeller.data()?.stripeAccountId || null) !== accountId ||
        ((latestSeller.data()?.stripeAccountCheckedAt?.toMillis?.() ?? 0) > now && latestSeller.data()?.stripeAccountStatus === 'active')) return null;
      if (setup === 'ready' || setup === 'unavailable') {
        tx.update(emailRef, { status: 'cancelled' });
        return null;
      }
      if (!actionable || !gateway.sendEmail || (data.leaseUntil ?? 0) > now) return null;
      if (stage === 'initial' && data.firstAttemptAt == null && now - data.createdAt >= FOLLOWUP_DELAY) {
        // If email was not configured for a week, only send the current follow-up.
        tx.update(emailRef, { status: 'cancelled' });
        return null;
      }
      if (data.firstAttemptAt != null && now - data.firstAttemptAt >= RETRY_WINDOW) {
        // An old ambiguous request might already have delivered. Never resend blindly.
        tx.update(emailRef, { status: 'needs_review', leaseUntil: 0 });
        return null;
      }
      tx.update(emailRef, { status: 'sending', firstAttemptAt: data.firstAttemptAt ?? now, leaseUntil: now + EMAIL_LEASE });
      return data.email as ReminderEmail;
    });
    if (!delivery) continue;
    const key = `author-payout-setup/${uid}/${stage}`;
    const providerId = await gateway.sendEmail!(delivery, key);
    await emailRef.update({ status: 'sent', providerId, sentAt: now, leaseUntil: 0 });
  }
  return setup;
}
