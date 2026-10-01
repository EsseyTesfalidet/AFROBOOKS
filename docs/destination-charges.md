# Book destination charges

AfroBooks uses Stripe Elements and PaymentIntents, not Checkout Sessions, for book purchases. Routing is therefore set directly on the PaymentIntent using `transfer_data.destination` and `application_fee_amount`.

## Behavior

- Book IDs come from the request. Authors, prices and connected-account IDs come from server-side database reads. Stripe account ownership and payout readiness are checked before checkout.
- When enabled, a cart belonging to one author uses a destination charge. Multiple books by that author still create one charge and one payout record. Gifts use the same path, with the original routing preserved across retries.
- Multi-author carts retain separate charges and source-linked transfers. Cross-country accounts also retain the existing path; destination charges involving a different settlement region require additional Connect capability and `on_behalf_of` work.
- The application fee retains the platform commission **plus the existing processing-fee estimate**. Stripe charges processing fees to the platform; actual fees can differ from the estimate. Author earnings remain the amount quoted by the current pricing calculation. For example, a $10 sale at the default fee yields $0.59 estimated processing, $1.41 commission and $8.00 author earnings; `application_fee_amount` is 200 cents.
- Fulfillment retrieves and verifies the actual Stripe transfer and application fee. Library access, total earnings and the net paid royalty record commit atomically. Already-transferred earnings never enter the author's pending balance.
- Duplicate webhooks cannot double-credit earnings. The separate-transfer worker skips destination orders and also checks the actual Stripe payment as a second defense against duplicate transfers.
- A transfer that precedes fulfillment temporarily defers reconciliation. Refunds, disputes and transfer reversals retain the existing staff-review/hold workflow. Application-fee refunds also trigger a review.

## Activation

October 1, 2026 update: the updated Firebase royalty worker is deployed and active, and real Stripe webhook delivery now returns HTTP 200 after the endpoint/signing-secret repair. `platformSettings/global.automatedPayoutsEnabled` is true. `STRIPE_DESTINATION_CHARGES_ENABLED` remains false pending the eligible-account Stripe test; the existing separate-charge/automatic-transfer flow is enabled. See `stripe-webhook-incident.md` for verified evidence and the inspected payments' status.

New destination charges default to **off**. Both `STRIPE_DESTINATION_CHARGES_ENABLED=true` in the server environment and `platformSettings/global.automatedPayoutsEnabled=true` are required. Disabling the flag affects new checkouts; already-created PaymentIntents retain their routing.

Before enabling:

1. Resolve the open webhook delivery incident and verify a real Stripe delivery returns 200. A locally generated signed probe alone does not verify Stripe's endpoint secret.
2. Validate the destination flow in Stripe test mode with an eligible connected account, including refund behavior. Automated tests cover calculation, transfer verification and database concurrency, but are not a live Stripe transaction.
3. Deploy the updated Firebase `processMonthlyPayouts` function **before** enabling destination checkout. The old worker cannot reconcile destination payout records.
4. Deploy the updated web application with the flag off. Confirm the webhook subscribes to `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `transfer.reversed`, and `application_fee.refunded`, alongside the existing subscription/promotion events.
5. Set the flag and redeploy the application. Confirm one sale's author net transfer, order, library entitlement and `payouts/destination_<payment-id>` agree before expanding use.

No historical payments are converted or paid again by this change. Review any previously collected but unfulfilled purchases separately.

## Pay once and keep the book

Normal book checkouts reserve each reader/book pair in a server-only transaction before contacting Stripe. Concurrent tabs reuse the same PaymentIntent and orders. Changing an unpaid cart cancels its old Stripe intent before releasing reservations; a successful, processing or uncertain payment cannot be replaced with another charge. Unknown creation attempts older than 23 hours require review rather than reusing an expired Stripe idempotency key.

The server checks permanent library entries and completed non-gift orders before starting payment. A missing library entry is repaired from a completed receipt. Gifts purchased for someone else do not count as the sender owning the book. Existing library security rules already prohibit client writes and deletions.

Owned titles are removed from the cart, and the library subscribes to updates. The authenticated receipt endpoint also checks the current Stripe payment and uses the same idempotent fulfillment transaction if webhook delivery is delayed. It never trusts the browser's payment status or lets one reader confirm another reader's orders. Webhooks remain necessary for receipts, gift email delivery, refunds and disputes.

Account deletion and content removal retain their existing behavior; this change does not recreate deleted books or promise access after an account is deleted.

## Validation status

Validation passed: 47 unit tests, 73 core Firestore/Storage integration tests, 17 purchase/destination integration tests and 5 Community integration tests. Coverage includes simultaneous checkout, lost Stripe responses, payment/cancellation races, delayed-webhook recovery, receipt authorization, library persistence, automatic-transfer reconciliation, protected uploads and account permissions. The Firebase CLI startup was slow in this environment; the cached Firestore and Storage emulators were started directly, with both emulators registered for cross-service rules checks.

Guest browser checks passed on nine routes at 390×844, 844×390 and 1280×900: browse, discover, cart, checkout, library, receipt, Community, login and signup. Protected routes redirected to login, layouts had no horizontal overflow and there were no uncaught browser exceptions. These are browser checks, not physical iOS/Android or real-payment tests. Staging endpoints also rejected unauthenticated payment/receipt requests and unsigned webhooks with the expected 401/403/400 responses.

The webhook now checks the current charge for refunds and disputes before granting a book. A delayed success notification for a refunded or disputed payment records a review state without granting access, crediting earnings or allowing another checkout. A regression test covers both separate and destination routing and stale retries. Existing completed purchases retain the established refund-review behavior.

A Stripe test-account trial reached account creation but Stripe refused its destination payment because onboarding had not activated the recipient's transfer capability; the synthetic account was closed. No real charge or transfer was made. Complete the eligible-account Stripe test before live activation. The release keeps `STRIPE_DESTINATION_CHARGES_ENABLED=false`; the Firebase worker update has since been deployed.

## Refunds

Creating a destination-charge refund does not by itself recover the author's transfer or refund the platform application fee. Staff must choose the intended transfer and fee reversal when refunding in Stripe. API refunds use `reverse_transfer` and, when applicable, `refund_application_fee`. This change does not introduce an automatic book-refund endpoint or silently debit authors during retries.

References: [Stripe destination charges with PaymentIntents](https://docs.stripe.com/connect/destination-charges?platform=web&ui=elements), [separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers), [application fee fields](https://docs.stripe.com/api/application_fees/object).
