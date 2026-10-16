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
