# Stripe Smart Retries and dunning settings (TUL-835)

Dashboard configuration, not code. Do this in Stripe **test mode first**, then live, by a human with Stripe access.

## Settings

Stripe Dashboard > Settings > Billing > Subscriptions and emails:

1. **Manage failed payments > Retry failed payments using Smart Retries**: ON.
   Policy: retry up to **4 times within 1 week**. This matches the app's 7-day grace window.
2. **Subscription status if all retries fail**: **Leave the subscription past_due** is NOT wanted. Choose **Cancel the subscription**
   (talent plans fall to Free through `customer.subscription.deleted`; workspaces drop to `free`).
   Choose "mark as unpaid" only if you want the plan to stay locked without cancelling.
3. **Customer emails > Send emails when card payments fail**: OFF. The app sends its own ES/EN
   "Tu pago no pasó / Your payment didn't go through" email on the first failure. Leaving Stripe's on would send two.
4. **Email finance contacts about invoice and subscription status**: optional, internal only.
5. **Billing portal** (Settings > Billing > Customer portal): enable **Update payment method**. The in-app
   "Update your card" / "Restore plan" button opens this portal.

## What the app does

| Moment | Behaviour |
|---|---|
| `invoice.payment_failed` (first) | Subscription synced to `past_due`, `past_due_since` stamped, one email sent (ledger `billing_dunning_notices`, keyed by invoice id). Later retries of the same invoice never resend. |
| Days 0-7 | Paid features stay on. Red banner: "Update your card". |
| After day 7 | `effectiveEntitlementPlan` (talent) reads the plan as Free. Content is kept. Banner offers "Restore plan". |
| `invoice.paid` | Resync to `active`, `past_due_since` cleared, features and banner gone. |

Grace length lives in `DUNNING_GRACE_DAYS` (`src/lib/billing/dunning-grace.ts`); keep the Smart Retries window at or below it.

## How to check it is on (TUL-1231)

Nothing in the repo can read or change these Stripe settings, so they need a human with Stripe access. Check **test mode first, then live**, and write the result on the TUL-1231 card (who, when, mode).

1. Open Settings > Billing > Subscriptions and emails (use the test-mode toggle for the first pass).
2. Under **Manage failed payments**, confirm: Smart Retries ON, "up to 4 times within 1 week" (never longer than `DUNNING_GRACE_DAYS`, 7), and the final action is **Cancel the subscription**.
3. Under **Customer emails**, confirm **Send emails when card payments fail** is OFF (see below).
4. Prove it with a TEST subscription on card `4000 0000 0000 0341` (attaches, then declines on the first renewal): after the renewal fails, exactly one email arrives, from the app ("Tu pago no pasó" / "Your payment didn't go through"), and none from Stripe. In the invoice's Stripe event log, `invoice.payment_failed` shows `next_payment_attempt` set, which is what proves Smart Retries is scheduling retries.
5. Update the card in the portal. The open invoice pays, `invoice.payment_succeeded` fires, and the plan returns to `active`.

## One email per event: ours, not Stripe's

The app sends the customer emails below. The matching Stripe customer emails must stay OFF, or the customer gets two.

| Event | Sent by the app | Stripe setting to keep OFF |
|---|---|---|
| First failed payment | `payment-failed` email (TUL-835), once per invoice | Send emails when card payments fail |
| Successful automatic charge | `payment-receipt` email (TUL-1232), once per invoice | Email customers about successful payments |
| Cancel / resume | `subscription-cancel-state` email (TUL-832) | Not applicable (Stripe sends none by default) |

Smart Retry attempts 2 to 4 on the same invoice send no further app email (the ledger is keyed on the invoice id), and Stripe's own retry emails are covered by the settings above.
