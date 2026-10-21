# TUL-1701 item 11 · Stripe TEST proof: percentage-only rent invoices arrive as a draft on `invoice.created`

Why: the percentage of sales is added to each monthly subscription invoice while it is still a DRAFT. A subscription whose
price is 0 (percentage-only plan) might be finalized by Stripe straight away instead of staying a draft for ~1 hour. If it
does, `RENT_AUTOPAY_PERCENT_ENABLED` must stay off. Run on staging with TEST keys only (US and MX platform each).

1. `RENT_AUTOPAY_ENABLED=1` and `RENT_AUTOPAY_PERCENT_ENABLED=1` on staging; both webhook endpoints subscribed
   (`scripts/ops/configure-stripe-webhook.sh test` and `... test mx`).
2. Create a percentage-only plan (rent_cents 0, 10%), accept it as the test member, start automatic payments.
3. Stripe test clock: advance the customer's clock to the subscription's next cycle (the 1st).
4. In the Stripe dashboard (TEST), open the new invoice: expected `status = draft` when `invoice.created` was delivered.
   Check the webhook log: `invoice.created` delivered, response 200, and the invoice then has the two items
   (percentage, Tulala fee) and metadata `rent_percent_cents`.
5. Record: invoice id, status at `invoice.created`, delivery time, items added. Attach to TUL-1701.
Pass = a draft with the items added before finalization on BOTH platforms. Fail = finalized at creation: keep the flag off
and the month falls to the marked path (`autopay_percent_missed`).
