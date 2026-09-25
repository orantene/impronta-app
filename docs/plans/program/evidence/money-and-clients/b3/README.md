# Stage B3 evidence — Order + lines at booking from talent_offerings

**PR intent:** Talent New booking / hold convert opens a draft `orders` row +
line(s) via existing POS owners (`createDraftOrder` / `addLine` /
`addCustomLine`), links `agency_bookings.order_id`, and writes
`total_client_revenue` in **major units** (cents/100). Also retargets writers
to the platform hub (`resolveTalentOwnWorkTenant`) so B3 is self-contained
ahead of B1 merge.

**Base:** `origin/main` @ `a619206ec` (includes A1 `centsToTotalClientRevenue`)

## Files

| Path | Change |
|---|---|
| `web/src/lib/talent-agenda/own-work-tenant.ts` | Hub tenant resolver (copied from B1 pattern) |
| `web/src/lib/talent-agenda/open-booking-order.ts` | Open draft + catalog/custom line; link order + revenue |
| `web/src/lib/talent-agenda/create-slot.ts` | Hub seller + `openBookingOrderForAgenda` after insert |
| `web/src/lib/talent-agenda/convert-hold.ts` | Hub seller + custom-line order on convert |
| `web/src/lib/talent-agenda/g0-honesty.static.test.ts` | Hub + B3 order contracts |
| `web/src/components/.../AgendaNewBooking.tsx` | Thin published-offering picker; Other… free-text |

## How the order is linked

1. Booking spine inserts (`agency_bookings` → `booking_talent` → `talent_bookings`).
2. `openBookingOrderForAgenda`:
   - `createDraftOrder` (`source_channel=talent_agenda`) on hub tenant.
   - Prefer `addLine` when `offeringId` is a published owned offering (same
     tenant as hub). On tenant mismatch / refusal → `addCustomLine` from
     offering title + `amount_cents`.
   - No offering → `addCustomLine` from free-text title (amount 0).
   - `UPDATE agency_bookings SET order_id, total_client_revenue = centsToTotalClientRevenue(total_cents)`.
   - Update `booking_talent.client_charge_*` from that major total.
   - Stamp `order_lines.booking_id` / `booking_kind=agency_booking`.

Finish-collect Card already prefers `agency_bookings.order_id` via
`ensureAgendaOrderShell` (no-op when linked).

## Not in this PR (explicit)

- Variants / addons / home-visit fee UI matrix.
- Retiring `ensureAgendaOrderShell` entirely.
- B2 `customer_id` / `ensureCustomer` on the draft.
- Forcing offerings onto hub tenant (custom-line fallback covers mismatch).

## Verify

```bash
cd web && npm run typecheck && npm run lint
npx tsx --test src/lib/talent-agenda/g0-honesty.static.test.ts
```

| Gate | Exit |
|---|---|
| `npm run typecheck` | 0 |
| `npm run lint` | 0 |
| `g0-honesty.static.test.ts` (9) | 0 |

Host proof (after merge + promote): New booking with a published offering →
`agency_bookings.order_id` set, `order_lines.offering_id` set (or custom line
when Other…), `total_client_revenue` = line major sum.
