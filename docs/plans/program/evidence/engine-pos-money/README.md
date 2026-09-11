# Evidence — POS money and operator engine

Package 1 proofs. Isolated apply (`fxlankepwnvelxjrahwk`) is recorded here when
the capacity-isolated env is present. Unit tests live next to the libs.

| Task | Migration | Unit / static | Race script |
|---|---|---|---|
| Custom amount | `20261231201000_pos_custom_amount_approvals.sql` | `web/src/lib/pos/custom-line.test.ts` | embedded DO $proof$ |
| Lock / operator | `20261231202000_pos_device_sessions.sql` | `web/src/lib/pos/device-session.test.ts` | embedded DO $proof$ |
| Link booking | `20261231203000_pos_link_booking.sql` | `web/src/lib/pos/link-booking.test.ts` | embedded DO $proof$ |
| Tip | `20261231204000_pos_tip_cents.sql` | `web/src/lib/pos/tip.test.ts` | embedded DO $proof$ |
| Payment links | `20261231205000_payment_links.sql` | `web/src/lib/payments/links.test.ts` | `web/scripts/verify-payment-link-reserve.mjs` |
| Table ops | `20261231206000_visit_check_ops.sql` | `web/src/lib/visits/check-ops.test.ts` | `web/scripts/verify-visit-transfer-race.mjs` |
| Waitlist offers | `20261231207000_waitlist_offers.sql` | `web/src/lib/scheduling/waitlist-offers.test.ts` | `web/scripts/verify-waitlist-offer-race.mjs` |
| Cash movements | `20261231208000_pos_shift_movements.sql` | `web/src/lib/pos/shift-movements.test.ts` | embedded close-math proof |

Contract: `docs/plans/program/engine/pos-money.md`.

Isolated apply (`fxlankepwnvelxjrahwk` via `npm run journeys:repair`) is a
blocker until `.env.capacity-isolated.local` is present in this environment.
Race scripts exit 2 without that env. Production `db:push` is out of scope
for this branch.
