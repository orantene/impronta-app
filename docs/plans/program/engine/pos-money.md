# POS money and operator engine — UI contract

Package 1. The UI session wires boards to these actions. This file is the
contract: names, input, result unions, refusal codes, sentence keys, readers,
and the boards each task unblocks.

Refusals are codes. Sentences live in `dashboard.pos.engine.refusal.*` in
en / es / fr. Actions return `{ ok: false, reason }` and never English prose.

`unavailable` is transport failure and never a second write path.

Custom-amount and shift-close actions live in `admin/pos/actions.ts`. Lock,
tip, payment-link, and waitlist actions live in
`web/src/lib/server-actions/pos-engine.ts`. Do not re-export that file from
`actions.ts`: Next.js then drops every POS action and the admin boot fails.

---

## Shared reader

`loadPosSale(admin, { tenantId, orderId })` in `web/src/lib/pos/sale-read.ts`
returns `PosSaleView` plus, after this package:

- `tipCents`
- per line: `kind` (`catalog` | `custom`), `needsApproval`, `operatorUserId`,
  `bookingId`, `bookingKind`

---

## 1. Custom amount + manager approval

Unblocks: POSCustomAmount, POSManagerApproval. Closes D-POS-23.

### `posAddCustomLine`

Input: `{ orderId, label, amountCents, expectedVersion?, idempotencyKey }`

Success: `{ ok: true, orderId, lineId, needsApproval }`

A custom line is written through `pos_mutate_draft_line` with `kind=custom`,
`offering_id` null, `owner_tenant_id = tenant`. Amounts above
`agencies.settings.pos.approval.custom_amount_limit_cents` (missing = 0) stay
locked until `pos_approvals` has a row. Collection and reprice refuse
`over_limit` while any locked custom line exists.

### `posSetStaffPin`

Input: `{ userId, pin }` — pin is 4–6 digits. Owner/manager only.

Success: `{ ok: true }`

Stores `crypt(pin, gen_salt('bf'))` at `agencies.settings.people.pins[userId]`.
Never returned.

### `posSetCustomAmountLimit`

Input: `{ limitCents }` — owner/manager only.

Success: `{ ok: true }`

Writes `agencies.settings.pos.approval.custom_amount_limit_cents`.

### `posApproveCustomAmount`

Input: `{ orderId, lineId, pin, operationKey, method?: 'pin'|'session' }`

Success: `{ ok: true, approvalId, already?: true }`

SQL verifies the hash, checks the approver is manager/admin/owner, writes
`pos_approvals`, unlocks the line. Replay of `operationKey` is idempotent.

| reason | sentence key |
|---|---|
| over_limit | `dashboard.pos.engine.refusal.over_limit` |
| pin_invalid | `dashboard.pos.engine.refusal.pin_invalid` |
| not_manager | `dashboard.pos.engine.refusal.not_manager` |
| already_approved | `dashboard.pos.engine.refusal.already_approved` |
| conflict | `dashboard.pos.engine.refusal.conflict` |
| not_found | `dashboard.pos.engine.refusal.not_found` |
| wrong_tenant | `dashboard.pos.engine.refusal.wrong_tenant` |
| invalid | `dashboard.pos.engine.refusal.invalid` |
| unavailable | `dashboard.pos.engine.refusal.unavailable` |

---

## 2. Lock screen / operator switch

Unblocks: POSLock, POSChangeServer (till). Closes D-POS-34.

Device key is a random id the client keeps in localStorage. The action
receives it. This package does not touch the client.

### `posLockTill`

Input: `{ deviceKey }`

Success: `{ ok: true, sessionId, lockedAt }`

### `posUnlockTill`

Input: `{ deviceKey, pin }`

Success: `{ ok: true, sessionId, operatorUserId }`

### `posSwitchOperator`

Input: `{ deviceKey, pin }`

Success: `{ ok: true, sessionId, operatorUserId }`

The open shift does not change. New sale lines record `operator_user_id`
from the unlocked session.

| reason | sentence key |
|---|---|
| pin_invalid | `dashboard.pos.engine.refusal.pin_invalid` |
| locked | `dashboard.pos.engine.refusal.locked` |
| no_session | `dashboard.pos.engine.refusal.no_session` |
| conflict | `dashboard.pos.engine.refusal.conflict` |
| not_found | `dashboard.pos.engine.refusal.not_found` |
| unavailable | `dashboard.pos.engine.refusal.unavailable` |

Reader: `posCurrentDeviceSession({ deviceKey })` → session or `no_session`.

---

## 3. Link a booking to a sale

Unblocks: POSLinkBooking, B03 POSAfterLink. Closes D-POS-26.

### `posLinkBooking`

Input: `{ orderId, bookingKind: 'talent_booking'|'agency_booking'|'admission', bookingId, operationKey }`

Success: `{ ok: true, orderId, already?: true }`

Lines on the sale gain `booking_id` / `booking_kind`. Paying the sale writes
`booking_transactions` against that booking (one shell, one paid row;
`idx_booking_transactions_booking_active` stays relaxed for order-backed rows).

| reason | sentence key |
|---|---|
| already_linked | `dashboard.pos.engine.refusal.already_linked` |
| wrong_tenant | `dashboard.pos.engine.refusal.wrong_tenant` |
| nothing_owed | `dashboard.pos.engine.refusal.nothing_owed` |
| conflict | `dashboard.pos.engine.refusal.conflict` |
| not_found | `dashboard.pos.engine.refusal.not_found` |
| unavailable | `dashboard.pos.engine.refusal.unavailable` |

---

## 4. Gratuity

Unblocks: D01–D08 customer display tip states. Closes D-POS-11.

### `posSetTip`

Input: `{ orderId, tipCents, operationKey, expectedVersion }`

Success: `{ ok: true, orderId, tipCents, totalCents, version }`

`tip_cents` is a column on `orders`, default 0, not a line. Written only
before collection. Totals rule:
`total = subtotal - discount + tax + tip`. Receipts and `loadPosSale` expose
`tipCents`. Refunds never refund a tip unless the whole order is refunded.

| reason | sentence key |
|---|---|
| already_collected | `dashboard.pos.engine.refusal.already_collected` |
| negative | `dashboard.pos.engine.refusal.negative` |
| conflict | `dashboard.pos.engine.refusal.conflict` |
| not_found | `dashboard.pos.engine.refusal.not_found` |
| not_draft | `dashboard.pos.engine.refusal.not_draft` |
| unavailable | `dashboard.pos.engine.refusal.unavailable` |

---

## 5. Payment links

Unblocks: POSPaymentLink, POSCollectAnotherWay, MW08_LinkSent.
Closes D-POS-27 (link half), D-POS-42.

### `createPaymentLink`

Input: `{ orderId, amountCents, idempotencyKey }`

Success: `{ ok: true, code, url, amountCents, expiresAt, already?: true }`

Reserves the amount through `pos_reserve_collection` (method `link`) and
mints `/pay/<code>` (agency + hub hosts). Stripe when keys exist, otherwise
`mock`. Expire-orders cron releases expired `open` links and their
reservation.

| reason | sentence key |
|---|---|
| exceeds_outstanding | `dashboard.pos.engine.refusal.exceeds_outstanding` |
| provider_unavailable | `dashboard.pos.engine.refusal.provider_unavailable` |
| expired | `dashboard.pos.engine.refusal.expired` |
| not_found | `dashboard.pos.engine.refusal.not_found` |
| wrong_tenant | `dashboard.pos.engine.refusal.wrong_tenant` |
| conflict | `dashboard.pos.engine.refusal.conflict` |
| unavailable | `dashboard.pos.engine.refusal.unavailable` |

Reader: `listPaymentLinks({ orderId })`.

---

## 6. Table operations

Unblocks: POSJoinTables (transfer), POSMergeChecks, POSChangeServer (floor),
POSMoveParty split. Recorded as D-POS-58 (L52 multi-order visit).

### `visitTransfer`

Input: `{ visitId, toSpaceId, operationKey, expectedVersion? }`

### `visitSplitCheck`

Input: `{ visitId, lineIds, operationKey }`

Success: `{ ok: true, orderId }` — new draft order, same `visit_id`.

### `visitMergeChecks`

Input: `{ fromVisitId, intoVisitId, operationKey }`

### `visitChangeServer`

Input: `{ visitId, userId }`

| reason | sentence key |
|---|---|
| not_open | `dashboard.pos.engine.refusal.not_open` |
| space_occupied | `dashboard.pos.engine.refusal.space_occupied` |
| lines_paid | `dashboard.pos.engine.refusal.lines_paid` |
| wrong_tenant | `dashboard.pos.engine.refusal.wrong_tenant` |
| conflict | `dashboard.pos.engine.refusal.conflict` |
| not_found | `dashboard.pos.engine.refusal.not_found` |
| unavailable | `dashboard.pos.engine.refusal.unavailable` |

Reader: existing floor read (`lib/visits/floor.ts`). A visit may now have
more than one order.

---

## 7. Waitlist offers with hold timer

Unblocks: the class/event hold-expired analogue (E05 / D-POS-25 re-hold).
T08 restaurant party waitlist is **not** this table (D-POS-59).

### `waitlistOfferPlace`

Input: `{ entryId, operationKey, ttlSeconds? }`

Success: `{ ok: true, offerId, expiresAt }`

Reserves via `reserve_resource_set_v2` with the offer's key.

### `waitlistAcceptOffer`

Input: `{ offerId, operationKey }`

### `waitlistDeclineOffer`

Input: `{ offerId }`

| reason | sentence key |
|---|---|
| no_place | `dashboard.pos.engine.refusal.no_place` |
| expired | `dashboard.pos.engine.refusal.expired` |
| already_accepted | `dashboard.pos.engine.refusal.already_accepted` |
| conflict | `dashboard.pos.engine.refusal.conflict` |
| not_found | `dashboard.pos.engine.refusal.not_found` |
| unavailable | `dashboard.pos.engine.refusal.unavailable` |

Expire-orders cron reaps lapsed offers and releases the hold.

---

## 8. Cash movements and hand-over

Unblocks: POSCashMovements, POSCashClose note. Closes D-POS-29.

### `posRecordShiftMovement`

Input: `{ kind: 'paid_in'|'paid_out'|'drop'|'float_add', amountCents, reason, shiftId? }`

### `posCloseShift` (extended)

Input gains optional `{ closeNote, handedOverTo }`.

Expected cash = float + cash sales + paid-in − paid-out − drops.
Variance = counted − expected.

| reason | sentence key |
|---|---|
| amount | `dashboard.pos.engine.refusal.amount` |
| not_found | `dashboard.pos.engine.refusal.not_found` |
| already_closed | `dashboard.pos.engine.refusal.already_closed` |
| version_conflict | `dashboard.pos.engine.refusal.conflict` |
| unavailable | `dashboard.pos.engine.refusal.unavailable` |

Reader: `currentShift` now includes `closeNote`, `handedOverTo`,
`movements[]`.
