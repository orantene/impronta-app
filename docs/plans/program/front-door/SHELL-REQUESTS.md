# Front door v27 — request for the message-shell developer

Handed over 2026-09-24. The guest panel reads these. It does not invent them.

## Guest-visible cards

Declined, Pay failed, and Refunded need a card the guest thread can render.

Refund is still `coming` at `web/src/components/messages-v5/screens/NextStep.tsx:71` (not `kit/NextStep.tsx`). `messagingRefund` can write `change_result`. `web/src/lib/messaging/payment-card-sync.ts` keeps the pay card `paid`. Staff cannot open refund from the next-step bar (D-MSG-415).

## Paid payload

Agree this shape now. Pull requests for the dock (#2230) and the Paid money line both read it. Do not make the panel invent numbers.

```
total
paid
due
currency
method
```

Amounts are cents or the same unit the order already uses. `currency` is `MXN` when the sale is in pesos. `method` is `card`, `cash`, or `transfer`.

## Slot taken

`slot_taken` must return the next free times. Today `web/src/app/t/[profileCode]/_actions/guest-chat-actions.ts` line 884 folds the reason into `engine_error`, and the engine does not return the next free slot. Until that list exists, the panel says "pick another time" and shows the live grid. It will not invent a clock time.

## Already known (D-MSG-415)

- POS cash writes no `order_confirmation`.
- A paid ticket writes no `tickets_card`.

## Still open after #2230

- `markPaid` writes `provider` on the paid card (`web/src/lib/bookings/transactions.ts`, the `payment_paid` insert). The dock reads `card_payload.method`. Put `method` (`card`, `cash`, or `transfer`) on that payload.
- A `payment_paid` row with no `sender_user_id` is classified as a system note in `web/src/app/t/[profileCode]/_actions/guest-chat-actions.ts` (the no-sender branch). The guest should see the paid card, not only a system note.
