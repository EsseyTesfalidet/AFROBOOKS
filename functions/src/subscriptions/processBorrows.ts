import * as functions from 'firebase-functions';

// No complete read-tracking/pool ledger exists yet. Keep the scheduled function
// deployed so an older implementation cannot continue issuing duplicate credits.
export const processMonthlyBorrowPayouts = functions.pubsub
  .schedule('0 8 1 * *').timeZone('UTC').onRun(async () => {
    console.log('Subscription royalty calculation paused; existing balances preserved.');
    return null;
  });
