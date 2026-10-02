# Book purchase receipts

Paid book orders use `deliverPurchaseReceipt` after server-verified fulfillment, from both the Stripe success webhook and authenticated purchase confirmation. A receipt includes the purchased titles, authors, actual item prices, total in USD, payment reference, and a library link (or gifts link for gift purchases). It has both HTML and plain-text versions. Receipt delivery never creates another charge or entitlement.

`purchaseReceiptEmails/{paymentIntentId}` is a server-only delivery record. A transaction verifies the completed orders, durable fulfillment, buyer and total before leasing a send. Pending, refunded and review orders do not generate a success receipt. Old orders already marked `receiptEmailSent` are respected.

The stored payload and `book-receipt-{paymentIntentId}` provider key stay identical across retries. Successful provider acceptance and order receipt flags commit together. Concurrent sends are blocked by a short lease. Failed sends cause the webhook to return HTTP 500 so Stripe can retry, while the purchased books remain fulfilled. Purchase confirmation does not withhold reading access because of an email failure. An ambiguous attempt older than 23 hours becomes `needs_review` instead of risking another send outside Resend's 24-hour deduplication window. Provider acceptance is not proof of inbox delivery; inspect Resend delivery/bounce logs when investigating a missing email.

Production needs `RESEND_API_KEY` and a verified sending domain. Set `RECEIPT_EMAIL_FROM` to the intended sender; otherwise it uses `GIFT_EMAIL_FROM`, then the legacy `AfroBooks <noreply@afrobooks.com>`. Receipt links use a valid HTTPS `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_BASE_URL`, falling back to `https://afrobs.com`. Vercel lists the production key as a sensitive variable; its blank value in an environment download does not mean the deployed value is missing. Its value and the sending domain were not verified during this change, and no live receipt emails were sent for testing.

These changes apply once deployed. Past missing receipts are not bulk-sent automatically. An authorized purchase confirmation or Stripe event retry can recover a receipt, provided its orders are still completed and its delivery record does not require manual review.

References: [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Stripe webhook delivery](https://docs.stripe.com/webhooks#automatic-retries).
