# A2 — Re-request / replace idempotency (attempt id; no orphan snapshots)

## Contract

Defect #14 / audit §0.4:

1. Idempotency keys for payment requests include an **attempt id** (Messages v5, v4 shell, Agenda pay request, Agenda finish-card).
2. `createPaymentLink` never returns `expired` for an expired/cancelled `operation_key` — it frees the key and mints a new open link.
3. `messagingRequestPayment` writes `checkout_snapshots` **only after** a successful mint (no orphan rows on refuse).

## Anchors

- `web/src/lib/payments/payment-request-attempt.ts`
- `web/src/lib/payments/links.ts` (free expired/cancelled key)
- `web/src/lib/server-actions/messaging-engine.ts` (`messagingRequestPayment`)
- `PaymentRequest.tsx`, `MessagesShell.tsx`, `AgendaPayRequest.tsx`, `booking-actions.ts`

## Proof

```bash
cd web && node --import tsx --test \
  src/lib/payments/payment-request-attempt.test.ts \
  src/lib/payments/a2-rerequest.static.test.ts \
  src/lib/payments/links.test.ts
```

Expected: all pass; expired-key remint test asserts old key renamed `:was:expired:` and a new open link owns the original key.

Manual: request pay → let link expire → request again → second link mints (new `payment_links` row; no orphan `checkout_snapshots` without `payment_link_id`).

Depends on paylink settle [#2273](https://github.com/orantene/impronta-app/pull/2273) on production (`605e0567c`).
