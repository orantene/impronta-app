# A3 — Cards tell the truth

## Contract

Defect #15 / audit §0.5 / SHELL-REQUESTS:

1. `syncPaymentCardsForRecord` updates **only** the payment_request card whose `paymentLinkCode` matches the link that changed (two requests on one inquiry → pay one → only that card reads paid).
2. Card states written: `expired`, `cancelled`, `refunded`, `partially_refunded`, `paid` (not mapping refunds back to a generic paid-only mirror without the refund state).
3. Paid payload carries `{ totalCents, paidCents, dueCents, currency, method }` (dock-agreed shape).
4. `messagingRequestPayment` stamps `currency` on mint.
5. A `payment_paid` row with no sender is still a **card** for the guest (not forced to a system note).

## Anchors

- `web/src/lib/messaging/payment-card-sync.ts`
- `web/src/lib/server-actions/messaging-engine.ts` (currency on card)
- `web/src/app/t/[profileCode]/_actions/guest-chat-actions.ts` (`deriveAuthorRole`)
- `web/src/components/messages-v5/client/ClientCards.tsx` (refunded / partial UI)

## Proof

```bash
cd web && NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
  ./node_modules/.bin/tsx --test \
  src/lib/messaging/payment-card-sync.test.ts \
  src/lib/messaging/a3-cards-truth.static.test.ts
```

Depends on paylink settle [#2273](https://github.com/orantene/impronta-app/pull/2273) on production (`605e0567c`).
