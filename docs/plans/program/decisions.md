# Shared contracts (P0-04)

Settled before implementation. Also appended to [`docs/decision-log.md`](../../decision-log.md) as L52–L56.

## L52 — Visit, order, payment, allocation, preparation

The existing `orders` row is the commercial record. No parallel "check" entity.

| Concept | Responsibility |
|---|---|
| Visit / occupancy | Who is being served, where, during which visit. New lightweight record keyed to a space. Owns table state and reset. QR identity is `visits.public_token`. |
| Order | Items, adjustments, commercial balance. Existing `orders` row. `orders.visit_id` is the occupancy link. `orders.space_id` stays the physical table. |
| Payment attempt | One attempt to collect money. Can be pending, declined, or unknown without the order changing. |
| Payment allocation | How confirmed money applies to an order. One order may have several; one payment may span orders. |
| Preparation ticket | What a station was instructed to prepare. Separate lifecycle, never derived from payment state. |

A multi-order visit record arrives only if a case proves one visit needs several orders (bill-splitting). Deferred until built.

**L52 column clarification (2026-09-08):** occupancy is `orders.visit_id`. `orders.space_id` remains `spaces.id`. Stuffing visit UUIDs into `space_id` would collide with the physical table identity that column was reserved for.

## L53 — POS command contract

POS does not call `createPurchase` per button press.

`createDraftOrder` · `addLine` / `updateLine` / `removeLine` · `repriceAndValidate` · `submitToPreparation` · `startCollection` · `recordVerifiedCollection` · `finalizeOrCancel`

Promotion resolution and capacity holds attach to `repriceAndValidate` and `startCollection`, never to line mutation. Extract only the boundaries the current work touches.

## L54 — Resource coordination

`talent_holds` stays separate from capacity pools. One transactional command reserves a set across both tables, all-or-nothing, consistent lock order (root-first, matching `FOR UPDATE OF p`), bounded deadlock retry.

Also defined: temporary hold vs confirmed booking; whole-set reschedule and cancellation; cross-business availability; resource substitution; cross-workspace privacy. No person-capacity migration.

## L55 — Refund effects

Money refunded and service cancelled are related decisions, not one action. Five effects:

1. Refund part of the price, keep the entitlement.
2. Cancel one ticket from a multi-ticket order — refund and revoke that admission, release that seat.
3. Refund after service as an adjustment — no entitlement change.
4. Revoke an unused admission — release the seat, refund optional.
5. Refund one component of a hybrid package — other components stand.

The UI states the effect before confirmation.

## L56 — Theme layers

Four independent things: **business type** (one primary, several secondary activities) · **vocabulary** (manual override → type preset → family preset → canonical localised default) · **enabled capabilities** (server-side gates) · **operational starting view** (presentation only).

Roster is not hidden because a business is solo. Visibility follows enabled capabilities and relationships.

Stable catalog page ID is `catalog`; the label is resolved through the words engine.

## Inventory boundary (ratify)

- In scope: a sellable limit with an explicit scope (offering, date, batch, session). Cancellation returns units to the pool they drew from.
- Out of scope: ingredients, purchasing, suppliers, valuation, replenishment, locations, receiving, COGS.

Do not seed `plan_capabilities` until the owner confirms the intended matrix.
