# Pay flow: TEST payment fixtures (list only, nothing executed)

Date 2026-10-17. For QA of `/pay/<code>` (TUL-1252, PR #3982) and the Stripe checkout behind it. Stripe TEST mode only: staging project, `sk_test_` key, Stripe's published test cards. No live keys, no production data, never TAL-93938. Prerequisite for any case that reaches Stripe: the staging TEST price rows (see `supabase/seed-staging-notes/stripe_test_product_prices.sql`) and a TEST connected account for the seller.

All cards: any future expiry, any 3-digit CVC, any ZIP. Use a QA seller (a `qa-*` workspace or the QA Max talent) and a QA client; the service must say QA / Test in its name and be hidden (AGENTS.md QA rules).

| # | Fixture | How to arrange it | Card | Expected |
|---|---|---|---|---|
| 1 | Success | open payment link `/pay/<code>` for a QA order, press pay | 4242 4242 4242 4242 | Stripe TEST checkout reached (page shows test mode), returns to `/pay/<code>?status=...`, link goes `paid`, receipt link shown on a tenant host (hidden on the app host by design), booking/order marked paid by the webhook |
| 2 | Declined | same link | 4000 0000 0000 0002 (generic decline); 4000 0000 0000 9995 (insufficient funds) | Stripe shows the decline, order stays unpaid, link stays `open`, a second attempt with 4242 succeeds (no double charge: idempotency key per code) |
| 3 | Abandoned | open the checkout, close the tab without paying | none | link stays `open`; after Stripe's session expiry the next visit starts a fresh session; no order is paid |
| 4 | Expired link | a link whose `expires_at` is in the past (or `status = expired`) | none | `/pay/<code>` shows the expired view with the way back to the conversation, no pay button; on another tenant's agency host: the branded 404 |
| 5 | Offer accept then pay | QA client accepts a talent's offer in the thread (Messages) | 4242 4242 4242 4242 | accepting returns a pay code, the client lands on `/pay/<code>` on a host that serves it (own agency domain, else the app host after #3982), pays, thread shows the paid card |
| 6 | 3DS required | same link | 4000 0025 0000 3155 (authentication required); 4000 0000 0000 3220 (3DS2) | Stripe's test authentication step appears; Complete -> paid; Fail -> back to the link unpaid and retryable |
| 7 | Refund (a flow exists: `lib/orders/refund-plan.ts`, desk / admin refund) | after fixture 1, refund from the seller's admin | none | refund recorded, `/pay/<code>` shows the refunded state (`pay-refund-status.ts`), client sees the refund line; fee handling per `refund-non-refundable-fees` |
| 8 | Invalid code | `/pay/zzzzzzzzzz` and a 3-character code | none | branded 404, Spanish copy for a Spanish visitor ("Página no encontrada") |
| 9 | Other tenant | tenant A's valid code opened on tenant B's agency host | none | 404 (never renders B's host with A's order) |

Mexico (MXN) guest pay uses the MX lane (`mxn-guest-pay-lane`); add its fixtures once the MX webhook (TUL-186, build-dependent) is live.

Safety: each case writes only QA rows on a QA workspace on staging. Do not run any of these against `app.tulala.digital`, `tulala.digital` or a customer workspace.
