import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { accountReadiness } from '../../functions/src/stripe/accountReadiness';
import type { VideoPayoutOverview } from '@/lib/watch/payouts';
import type { AuthenticatedRequestUser } from './auth';
import { videoPayoutGateway, videoPayoutStripeReady, type VideoPayoutGateway, type VideoTransfer } from './watchPayoutGateway';
import { WatchError } from './watchErrors';

const zeroDecimal = new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','VND','VUV','XAF','XOF','XPF']);
const threeDecimal = new Set(['BHD','JOD','KWD','OMR','TND']);
export function videoCurrencyUnit(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new WatchError(409, 'Invalid payout currency.');
  return BigInt(zeroDecimal.has(currency) ? 1e9 : threeDecimal.has(currency) ? 1e6 : 1e7);
}
function transferableNanos(nanos: bigint, currency: string) {
  const unit = videoCurrencyUnit(currency);
  // Stripe requires whole ISK/UGX despite using two-decimal API amounts.
  const step = ['ISK','UGX'].includes(currency) ? BigInt(100) : threeDecimal.has(currency) ? BigInt(10) : BigInt(1);
  const minor = (nanos / unit / step) * step;
  if (minor < BigInt(0) || minor > BigInt(99999999)) throw new WatchError(409, 'Payout amount needs review.');
  return { minor: Number(minor), nanos: (minor * unit).toString() };
}
function cutoff(period: string, now = Date.now()) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) throw new WatchError(400, 'Choose a valid earnings month.');
  const [year, month] = period.split('-').map(Number); const end = Date.UTC(year, month, 1);
  if (end > now) throw new WatchError(409, 'Only completed months can be paid.');
  return end;
}
const payoutId = (period: string, creatorId: string, currency: string) => createHash('sha256').update(`${period}:${creatorId}:${currency}`).digest('hex');

export async function registerVideoFunding(actor: AuthenticatedRequestUser, input: unknown, gateway?: VideoPayoutGateway) {
  if (actor.role !== 'admin') throw new WatchError(403, 'Administrator access required.');
  const data = z.object({ period: z.string(), topupId: z.string().regex(/^tu_[A-Za-z0-9]+$/), settled: z.literal(true) }).strict().parse(input);
  cutoff(data.period);
  const stripe = gateway || videoPayoutGateway();
  const topup = await stripe.funding(data.topupId);
  if (topup.id !== data.topupId || !topup.live || !topup.available || !Number.isSafeInteger(topup.net) || topup.net <= 0) throw new WatchError(409, 'This live Stripe top-up has not settled into your available balance.');
  videoCurrencyUnit(topup.currency);
  if (await stripe.available(topup.currency) < topup.net) throw new WatchError(409, 'Keep the funded amount available in Stripe before registering it.');
  const db = await getAdminDb();
  await db.runTransaction(async tx => {
    const fundingRef = db.doc(`watchPayoutFunding/${data.topupId}`);
    const budgetRef = db.doc(`watchPayoutBudgets/${data.period}_${topup.currency}`);
    const [funding, budget] = await Promise.all([tx.get(fundingRef), tx.get(budgetRef)]);
    if (funding.exists) {
      if (funding.data()?.period !== data.period) throw new WatchError(409, 'This top-up is already assigned to another month.');
      return;
    }
    const creditedMinor = (budget.data()?.creditedMinor || 0) + topup.net;
    if (!Number.isSafeInteger(creditedMinor)) throw new WatchError(409, 'Funding amount needs review.');
    tx.create(fundingRef, { ...data, currency: topup.currency, netMinor: topup.net, actorId: actor.uid, createdAt: Date.now() });
    tx.set(budgetRef, { period: data.period, currency: topup.currency, creditedMinor,
      reservedMinor: budget.data()?.reservedMinor || 0, spentMinor: budget.data()?.spentMinor || 0, cursor: '', updatedAt: Date.now() }, { merge: true });
    tx.create(db.collection('watchAudit').doc(), { actorId: actor.uid, action: 'video_payout_funding', topupId: data.topupId, period: data.period, createdAt: Date.now() });
  });
  return { ok: true };
}

function transferMatches(t: VideoTransfer, payout: Record<string, unknown>, id: string) {
  const destination = typeof t.destination === 'string' ? t.destination : t.destination?.id;
  return t.livemode && t.amount === payout.amountMinor && t.currency.toUpperCase() === payout.currency && destination === payout.destination &&
    t.transfer_group === `video_${id}` && t.metadata.integration === 'afrobooks-video' && t.metadata.videoPayoutId === id && t.metadata.creatorId === payout.creatorId && t.amount_reversed === 0;
}

export async function reviewVideoTransferReversal(db: Firestore, transferId: string, gateway: VideoPayoutGateway = videoPayoutGateway()) {
  const transfer = await gateway.retrieve(transferId);
  const id = transfer.metadata.videoPayoutId;
  if (transfer.metadata.integration !== 'afrobooks-video' || !/^[a-f0-9]{64}$/.test(id || '')) return;
  await db.runTransaction(async tx => {
    const ref = db.doc(`watchPayouts/${id}`); const payout = await tx.get(ref);
    if (!payout.exists || !transferMatches({ ...transfer, amount_reversed: 0 }, payout.data()!, id)) throw new WatchError(409, 'Video transfer ownership needs review.');
    if (transfer.amount_reversed <= 0) return;
    tx.update(ref, { status: 'needs_review', transferId, reversedMinor: transfer.amount_reversed,
      notice: 'This transfer was reversed in Stripe. Reconcile the returned funds and creator balance before another payout.', leaseUntil: 0 });
    tx.set(db.doc(`watchTransferReceipts/${transferId}`), { payoutId: id, creatorId: payout.data()!.creatorId, destination: payout.data()!.destination,
      amount: transfer.amount, currency: transfer.currency, reversedMinor: transfer.amount_reversed, status: 'reversed' });
  });
}

export async function payVideoCreator(db: Firestore, budgetId: string, creatorId: string, gateway: VideoPayoutGateway, now = Date.now()) {
  const budgetRef = db.doc(`watchPayoutBudgets/${budgetId}`); const budget = (await budgetRef.get()).data();
  if (!budget) return 'unfunded';
  const end = cutoff(budget.period, now); const currency: string = budget.currency;
  const id = payoutId(budget.period, creatorId, currency); const ref = db.doc(`watchPayouts/${id}`);
  const seller = (await db.doc(`sellers/${creatorId}`).get()).data();
  if (!seller?.stripeAccountId) return 'setup_required';
  const account = await gateway.account(seller.stripeAccountId);
  if (account.metadata?.userId !== creatorId || accountReadiness(account).stripeAccountStatus !== 'active') return 'setup_required';
  const reserved = await db.runTransaction(async tx => {
    const [existing, funds, earnings, payouts, currentSeller] = await Promise.all([
      tx.get(ref), tx.get(budgetRef), tx.get(db.collection('watchPlayEarnings').where('creatorId', '==', creatorId).limit(1001)),
      tx.get(db.collection('watchPayouts').where('creatorId', '==', creatorId).limit(1001)), tx.get(db.doc(`sellers/${creatorId}`)),
    ]);
    if (currentSeller.data()?.stripeAccountId !== account.id) return false;
    if (existing.data()?.leaseUntil > now) return false;
    if (existing.exists && ['paid','cancelled'].includes(existing.data()!.status)) return false;
    if (existing.exists && (existing.data()?.attemptStartedAt || existing.data()?.status === 'needs_review')) return true;
    if (earnings.size > 1000 || payouts.size > 1000) throw new WatchError(409, 'Creator payout history requires a paginated review.');
    let earned = BigInt(0); let disbursed = BigInt(0);
    for (const row of earnings.docs) {
      const e = row.data(); if (e.createdAt >= end) continue;
      if (e.currency === null || ['pending','refund_pending'].includes(e.status)) return false;
      if (e.currency !== currency) continue;
      if (!['accrued','reversed'].includes(e.status) || !/^\d+$/.test(e.creatorEarningsNanos || '')) return false;
      // Reconcile recent Google state before releasing earnings.
      if (!e.financialVerifiedAt || now - e.financialVerifiedAt > 24 * 60 * 60_000) return false;
      earned += BigInt(e.creatorEarningsNanos);
    }
    for (const row of payouts.docs) {
      const p = row.data(); if (p.currency !== currency) continue;
      if (row.id === id || p.status === 'cancelled') continue;
      if (p.status !== 'paid') return false; // Resolve ambiguous older transfers first.
      disbursed += BigInt(p.amountNanos);
    }
    // Later refunds are deducted from future payments, including across months.
    if (earned <= disbursed) {
      if (existing.exists) {
        tx.update(ref, { status: 'cancelled', notice: 'Earnings changed before the transfer was sent.' });
        tx.update(budgetRef, { reservedMinor: funds.data()!.reservedMinor - existing.data()!.amountMinor });
      }
      return false;
    }
    const amount = transferableNanos(earned - disbursed, currency);
    const previouslyReserved = existing.data()?.amountMinor || 0;
    const available = funds.data()!.creditedMinor - funds.data()!.reservedMinor - funds.data()!.spentMinor + previouslyReserved;
    if (amount.minor <= 0 || amount.minor > available) return false;
    tx.set(ref, { creatorId, period: budget.period, currency, amountMinor: amount.minor, amountNanos: amount.nanos,
      destination: account.id, budgetId, status: 'reserved', transferId: null, notice: null, createdAt: now, leaseUntil: 0 });
    tx.update(budgetRef, { reservedMinor: funds.data()!.reservedMinor + amount.minor - previouslyReserved });
    return true;
  });
  if (!reserved) return 'waiting';
  const owner = randomUUID();
  const payout = await db.runTransaction(async tx => {
    const p = (await tx.get(ref)).data()!;
    if (!['reserved','processing','needs_review'].includes(p.status) || p.leaseUntil > now || p.destination !== account.id) return null;
    tx.update(ref, { leaseUntil: now + 10 * 60_000, leaseOwner: owner }); return p;
  });
  if (!payout) return 'busy';
  try {
    const found = await gateway.find(`video_${id}`);
    if (found.length > 1 || (found[0] && !transferMatches(found[0], payout, id))) {
      await ref.update({ status: 'needs_review', notice: 'Stripe transfer details need review.', leaseUntil: 0 }); return 'needs_review';
    }
    let transfer = found[0];
    if (!transfer) {
      // Stripe may discard idempotency keys after 24h. An ambiguous old attempt
      // is never repeated automatically; recovery searches Stripe first.
      if (payout.status === 'needs_review' || (payout.attemptStartedAt && now - payout.attemptStartedAt > 23 * 60 * 60_000)) {
        await ref.update({ status: 'needs_review', notice: 'An earlier transfer attempt needs Stripe reconciliation.', leaseUntil: 0 }); return 'needs_review';
      }
      const funding = await db.collection('watchPayoutFunding').where('period', '==', budget.period).get();
      const sources = funding.docs.filter(doc => doc.data().currency === currency);
      if (!sources.length) throw new Error('Verified video funding is missing');
      for (const source of sources) {
        const latest = await gateway.funding(source.id);
        if (!latest.live || !latest.available || latest.currency !== currency || latest.net !== source.data().netMinor) {
          await ref.update({ notice: 'Registered funding changed in Stripe. Review the top-up before payouts can continue.', leaseUntil: 0 }); return 'unfunded';
        }
      }
      if (await gateway.available(currency) < payout.amountMinor) {
        await ref.update({ notice: 'Waiting for sufficient available Stripe balance.', leaseUntil: 0 }); return 'unfunded';
      }
      await ref.update({ status: 'processing', attemptStartedAt: payout.attemptStartedAt || now });
      transfer = await gateway.transfer({ amount: payout.amountMinor, currency, destination: payout.destination, id, creatorId });
      if (!transferMatches(transfer, payout, id)) throw new Error('Stripe transfer mismatch');
    }
    await db.runTransaction(async tx => {
      const [p, funds] = await Promise.all([tx.get(ref), tx.get(budgetRef)]);
      if (p.data()?.status === 'paid' || p.data()?.reversedMinor > 0) return;
      if (p.data()?.leaseOwner !== owner || p.data()?.amountMinor !== transfer.amount) throw new Error('Payout lease changed');
      tx.update(ref, { status: 'paid', transferId: transfer.id, paidAt: Date.now(), notice: null, leaseUntil: 0 });
      tx.update(budgetRef, { reservedMinor: funds.data()!.reservedMinor - transfer.amount, spentMinor: funds.data()!.spentMinor + transfer.amount });
      // Book reconciliation recognizes only this verified, server-owned receipt.
      tx.set(db.doc(`watchTransferReceipts/${transfer.id}`), { payoutId: id, creatorId, destination: payout.destination, amount: transfer.amount, currency: transfer.currency, status: 'paid' });
      tx.set(db.doc(`notifications/video_payout_${id}`), { userId: creatorId, type: 'payout', title: 'Video earnings transferred', message: 'Your monthly video earnings have been transferred to your Stripe account. View details in Video studio.', link: '/video-studio', read: false, createdAt: new Date() });
    });
    return 'paid';
  } catch {
    await ref.update({ notice: 'Stripe transfer needs reconciliation; automatic retry will check for an existing transfer first.', leaseUntil: 0 });
    return 'retry';
  }
}

export async function runVideoPayouts(db: Firestore, gateway?: VideoPayoutGateway) {
  const funds = await db.collection('watchPayoutBudgets').orderBy(FieldPath.documentId(), 'desc').limit(12).get();
  if (funds.empty) return { checked: 0, paid: 0 };
  const stripe = gateway || videoPayoutGateway(); let checked = 0; let paid = 0;
  // Each funded month/currency walks creator IDs, so one incomplete account
  // cannot prevent other creators from receiving their earnings.
  for (const fund of funds.docs) {
    if (checked >= 5) break;
    let creators = db.collection('watchCreators').orderBy(FieldPath.documentId());
    if (fund.data().cursor) creators = creators.startAfter(fund.data().cursor);
    const page = await creators.limit(5 - checked).get();
    for (const creator of page.docs) {
      try { if (await payVideoCreator(db, fund.id, creator.id, stripe) === 'paid') paid++; }
      catch { /* A provider/account failure is retried on the next sweep. */ }
      checked++;
    }
    await fund.ref.update({ cursor: page.size ? page.docs[page.size - 1].id : '', lastRunAt: Date.now() });
  }
  return { checked, paid };
}

export async function getVideoPayoutOverview(actor: AuthenticatedRequestUser): Promise<VideoPayoutOverview> {
  if (!['admin','seller','both'].includes(actor.role)) throw new WatchError(403, 'Creator access required.');
  const db = await getAdminDb();
  const query = actor.role === 'admin' ? db.collection('watchPayouts').orderBy('createdAt', 'desc') : db.collection('watchPayouts').where('creatorId', '==', actor.uid);
  const payouts = await query.limit(100).get();
  const funding = actor.role === 'admin' ? await db.collection('watchPayoutBudgets').orderBy(FieldPath.documentId(), 'desc').limit(24).get() : null;
  return { payouts: payouts.docs.map(d => { const p = d.data(); return { id: d.id, creatorId: p.creatorId, period: p.period, currency: p.currency, amountNanos: p.amountNanos, status: p.status, transferId: p.transferId, notice: p.notice, createdAt: p.createdAt }; }),
    funding: funding?.docs.map(d => { const f = d.data(); return { id: d.id, period: f.period, currency: f.currency, creditedMinor: f.creditedMinor, reservedMinor: f.reservedMinor, spentMinor: f.spentMinor }; }) || [], stripeReady: videoPayoutStripeReady() };
}
