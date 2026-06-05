# $1 live payout test runbook

How to prove the real money loop end to end on the LIVE Stripe account using
$1, with a hard kill switch so nothing moves money until you flip one flag.
This is the owner's runbook: only the owner sets live keys and flips the flag.

## The single master switch

All payout rails (Connect transfers AND Global Payouts OutboundPayments) are
gated by one env var:

```
STRIPE_ALLOW_LIVE_PAYOUTS=true
```

- On a LIVE key (`sk_live_…`) with the flag **unset or false**, every payout
  leg is refused at the source and held on the platform. No transfer, no
  OutboundPayment. The booking still records the payment; the payout just waits.
- Flip it to `true` only for the deliberate test, then set it back to `false`.
- On a test key (`sk_test_…`) the flag is ignored (test money is free to move).

This is enforced in `assertLivePayoutSafe()` and now wired into both the Connect
rail (`disburse.ts → connectTransfer`) and the Global Payouts rail
(`createOutboundPayment`).

## Cost of one full loop

| Leg | Amount | Recoverable? |
|---|---|---|
| Client charge | $1.00 | Yes — refund the PaymentIntent after |
| Stripe charge fee | ~$0.33 (2.9% + $0.30) | No — fees are not refunded |
| Platform → talent transfer | e.g. $0.80 | Yes — reverse the transfer |
| Connected-account payout to bank | the transferred amount | stays in the test bank |

Net real cost of one loop: roughly **$0.33** (the processing fee). Everything
else you can claw back.

---

## Track A — Connect rail (default, already proven on sandbox)

This is the rail Sofía is on today (US connected account, bank ····6789).

1. **Set env (owner only).** In the deploy/runtime env:
   - `STRIPE_SECRET_KEY=sk_live_…`
   - `STRIPE_PUBLISHABLE_KEY=pk_live_…`
   - Leave `STRIPE_ALLOW_LIVE_PAYOUTS` **unset** for now.
2. **Confirm the talent is payout-ready.** Money → Payout settings drawer should
   show "You're set up to get paid" (Connect `payouts_enabled`). If not, finish
   Connect onboarding with a real bank first (KYC is required on live).
3. **Create a $1 booking.** Seed/convert an inquiry so the booking gross is
   **$1.00** and the talent's net snapshot is a few cents (e.g. $0.80). Keep the
   currency = the connected account's currency (USD here) to avoid a
   cross-currency hold.
4. **Pay it.** In Messages → Pay now, pay the $1 with a **real card you own**.
   (Do this yourself in the browser — I never enter card numbers.) Stripe creates
   a real PaymentIntent and the webhook calls `markPaid`.
5. **Watch it hold.** Because the flag is still off, `executeBookingTransfers`
   logs the talent leg as `skipped_live_disabled` and the ledger row is `held`.
   Confirm: no transfer in the Stripe Dashboard, booking shows paid.
6. **Flip the switch and re-run.** Set `STRIPE_ALLOW_LIVE_PAYOUTS=true`, then
   re-trigger the payout (re-run `markPaid` for that transaction, or the
   admin "Mark received" action). Now a real `tr_…` transfer of ~$0.80 lands on
   the connected account.
7. **Verify.** Stripe Dashboard → Connect → the connected account: a transfer of
   ~$0.80, then a payout to its bank on the standard schedule (~2 business days).
   In Supabase, `booking_payouts` talent leg = `transferred` with the `tr_…` id.
8. **Set the flag back to false** immediately.
9. **Claw back.** Refund the $1 PaymentIntent (Dashboard or
   `create_refund`) and reverse the transfer (Dashboard → the transfer →
   Reverse). You eat only the ~$0.33 fee.

## Track B — Global Payouts rail (the new v2 OutboundPayment)

Use this to prove a local-bank payout to a country Connect cross-border can't
reach. The recipient (Sofía's v2 account `acct_…`, US bank) already exists.

1. Same env as Track A.
2. **Fund the FinancialAccount.** OutboundPayments draw from the platform
   FinancialAccount balance, not the charge directly. Top it up with ~$1 of
   available USD (a live top-up or by letting a live charge settle into the FA).
3. **Point the talent's payout at the GP rail.** The route resolves to
   `global_payouts` when the talent has a `gp_recipient_account_id` and GP is
   active. Sofía's recipient is already linked.
4. **Flip `STRIPE_ALLOW_LIVE_PAYOUTS=true`** and run `markPaid` for a $1 booking
   on that talent. `disburse → globalPayout` creates a real OutboundPayment of
   ~$0.80 from the FA to the recipient bank.
5. **Verify.** Stripe Dashboard → the OutboundPayment (`obp_…`) status
   `processing → posted`; the v2 webhook (`/api/webhooks/stripe-v2`) reconciles
   `booking_payouts` to `transferred`.
6. **Set the flag back to false.** OutboundPayments to a real external bank are
   not as trivially reversible as a Connect transfer, so keep this to $1 and
   only after Track A is green.

---

## Safety rules baked in

- One flag (`STRIPE_ALLOW_LIVE_PAYOUTS`) is the only thing standing between
  "read-only live" and "moves real money". Default off.
- Blocked legs HOLD (never silently fail), so flipping the flag and re-running
  settles them cleanly — no lost payouts.
- The charge amount + currency are verified in the webhook before `markPaid`
  (`#5` guard), so a mismatched charge can't trigger a payout.
- I (the assistant) will not enter card/bank/KYC fields or move real money. The
  owner performs the card payment and flips the flag; I can drive the read-only
  and held-state verification.

## Quick reference

- Flag: `STRIPE_ALLOW_LIVE_PAYOUTS` (web/src/lib/payments/global-payouts.ts)
- Connect rail: `disburse.ts → connectTransfer`
- GP rail: `disburse.ts → globalPayout` + `createOutboundPayment`
- Payout trigger: `markPaid(txnId)` → `executeBookingTransfers`
- Ledger: `booking_payouts` (status: held | transferred | failed)
- Recipient (Sofía, GP): v2 account with US bank, linked in `talent_profiles`
