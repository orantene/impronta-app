# Fees: verified vs TBD for Oran (TUL-1061)

Rule: the app shows ONLY the VERIFIED rows below. Everything under TBD is not
shown to clients or talents and is not used by any estimate until Oran decides.
All figures were read from Stripe's own published pages on 2026-10-14/15
(test mode work only; no live account was touched). Rates live in
`src/lib/billing/fee-config.ts`; this file is documentation, not code.

## VERIFIED (shown / used)

| Fee | Value | Source |
|---|---|---|
| US card payment | 2.9% + USD 0.30 | stripe.com/us/pricing |
| Mexico card payment | 3.6% + MXN 3.00, plus 16% IVA on the fee | stripe.com/pricing (Mexico), Notion wiki "Payments at Tulala: How We Use Stripe" sec. 5 |
| Tulala client service fee | +1.5% (Tulala's own rule, not a Stripe fee) | Notion fee rule page |
| Payout timing: US | 2 business days | docs.stripe.com/payouts country table |
| Payout timing: MX, CA | first payout 7 calendar days, then 3 business days | docs.stripe.com/payouts country table |
| First payout of a new account | typically 7 to 14 days | docs.stripe.com/payouts |

Paid by Tulala, so NOT a client or talent fee (left out of the UI on purpose):
Connect payout 0.25% + USD 0.25 per payout and USD 2 per active account per month
(US "you handle pricing", stripe.com/us/connect/pricing); Mexico platform 0.25% +
MXN 12 per payout and MXN 35 per active account per month (stripe.com/connect/pricing, Mexico).

## TBD for Oran (published, conflicting, or unpublished; NOT shown, NOT used)

| Item | What Stripe publishes | Why it is TBD |
|---|---|---|
| International-card surcharge | US +1.5% (stripe.com/us/pricing); Mexico +0.5% (stripe.com/pricing Mexico) | Published for standard pricing; whether it applies to Tulala's contract, and whether to show it to clients, is a decision. |
| Currency-conversion surcharge | US +1%; Mexico +2% | Same. Applies when a charge is converted (for example EUR/GBP/CAD on the US account). |
| Combined "all-in" foreign-card figure (earlier ~5.4% + USD 0.30) | none (it was our own sum of the two rows above) | A derived number, never shown or used. |
| Instant payouts | Connect pricing page: 1% of payout volume; Stripe Dashboard instant-payouts page: 1.5% US, 1% EU/UK/CA, per-payout minimums | The two pages differ; not offered yet. |
| Cross-border payouts | "starting at 0.25%" of payout volume; exact rate per country not published | Exact fee unknown. |
| Second currency conversion on a cross-border payout | not published | Measured in test mode at about 1% (CAD and EUR runs), unconfirmed for live. |
| Stablecoin (USDC) payout fee | none published; 1% + USD 0.25 was quoted by email | Unconfirmed, private preview, not offered. |
| Whether Tulala passes any Stripe surcharge to clients (visible fee line vs included in price) | n/a | Oran's decision (TUL-654); the checkout card-fee memo flag stays OFF. |

When a TBD row is confirmed, move it to VERIFIED here AND add it to
`fee-config.ts` in the same change; `fee-config.static.test.ts` will keep failing
on any unverified figure that reaches `src/` or the message files until then.
